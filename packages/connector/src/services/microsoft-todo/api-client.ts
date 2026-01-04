/**
 * Microsoft To Do API Client
 *
 * OAuth 2.0 authentication (refresh token) and API calls.
 * Data fetching only, no DB operations.
 *
 * Credentials:
 * - Loaded from Supabase Vault (getCredentials("microsoft_todo"))
 * - access_token is auto-refreshed when expired
 */

import { config } from "dotenv";
import {
  getCredentials,
  updateCredentials,
} from "../../lib/credentials-vault.js";
import { setupLogger } from "../../lib/logger.js";

// Load .env for local development
config();

const logger = setupLogger("mstodo-api");

// Configuration
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const DEFAULT_THRESHOLD_MINUTES = 5;
const DEFAULT_RETRY_DELAY_SEC = 1;

// Types
export interface AuthInfo {
  accessToken: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface TodoList {
  id: string;
  displayName: string;
  isOwner: boolean;
  isShared: boolean;
  wellknownListName: string;
}

export interface TodoTask {
  id: string;
  title: string;
  body?: {
    content: string;
    contentType: string;
  };
  status: "notStarted" | "inProgress" | "completed" | "waitingOnOthers" | "deferred";
  importance: "low" | "normal" | "high";
  isReminderOn: boolean;
  categories: string[];
  createdDateTime: string;
  lastModifiedDateTime: string;
  completedDateTime?: {
    dateTime: string;
    timeZone: string;
  };
  dueDateTime?: {
    dateTime: string;
    timeZone: string;
  };
  startDateTime?: {
    dateTime: string;
    timeZone: string;
  };
  recurrence?: Record<string, unknown>;
  hasAttachments: boolean;
}

// Authentication Cache
let cachedAuth: AuthInfo | null = null;
let cachedExpiresAt: Date | null = null;

/**
 * Reset cache (for testing)
 */
export function resetCache(): void {
  cachedAuth = null;
  cachedExpiresAt = null;
}

/**
 * Handle rate limit response
 */
async function handleRateLimit(response: Response): Promise<number> {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds;
    }
  }
  return DEFAULT_RETRY_DELAY_SEC;
}

/**
 * HTTP request with retry for rate limits
 */
async function requestWithRetry(
  method: string,
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let serverErrorRetried = false;

  while (true) {
    const response = await fetch(url, { method, ...options });

    if (response.status < 400) {
      return response;
    }

    if (response.status === 429) {
      const waitSeconds = await handleRateLimit(response);
      logger.warn(`Rate limited (429). Waiting ${waitSeconds}s...`);
      await new Promise((r) => setTimeout(r, waitSeconds * 1000));
      continue;
    }

    if (response.status >= 500 && response.status < 600) {
      if (!serverErrorRetried) {
        serverErrorRetried = true;
        logger.warn(`Server error (${response.status}). Retrying once...`);
        await new Promise((r) => setTimeout(r, DEFAULT_RETRY_DELAY_SEC * 1000));
        continue;
      }
    }

    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
}

/**
 * Refresh access token from Microsoft OAuth
 */
async function refreshTokenFromApi(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<TokenResponse> {
  const response = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "Tasks.ReadWrite offline_access",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh error: ${response.status} - ${text}`);
  }

  return (await response.json()) as TokenResponse;
}

/**
 * Get authentication info (cached with auto-refresh)
 */
export async function getAuthInfo(forceRefresh: boolean = false): Promise<AuthInfo> {
  // Check cache
  if (!forceRefresh && cachedAuth !== null && cachedExpiresAt !== null) {
    const minutesUntilExpiry =
      (cachedExpiresAt.getTime() - Date.now()) / 1000 / 60;
    if (minutesUntilExpiry > DEFAULT_THRESHOLD_MINUTES) {
      logger.debug(`Using cached auth (${Math.round(minutesUntilExpiry)} min until expiry)`);
      return cachedAuth;
    }
  }

  // Load from vault
  logger.debug("Loading credentials from vault...");
  const result = await getCredentials("microsoft_todo");
  const credentials = result.credentials as Record<string, unknown>;
  let expiresAt = result.expiresAt;

  // Validate required fields
  if (!credentials.client_id || !credentials.client_secret) {
    throw new Error("Missing client_id or client_secret");
  }
  if (!credentials.access_token || !credentials.refresh_token) {
    throw new Error("Missing access_token or refresh_token. Run OAuth flow first.");
  }

  // Check if refresh needed
  let needsRefresh = forceRefresh;
  if (!needsRefresh) {
    if (!expiresAt) {
      needsRefresh = true;
    } else {
      const minutesUntilExpiry =
        (expiresAt.getTime() - Date.now()) / 1000 / 60;
      needsRefresh = minutesUntilExpiry <= DEFAULT_THRESHOLD_MINUTES;
    }
  }

  let accessToken = credentials.access_token as string;
  let currentExpiresAt = expiresAt;

  // Refresh if needed
  if (needsRefresh) {
    logger.info("Refreshing access token...");
    const newToken = await refreshTokenFromApi(
      credentials.client_id as string,
      credentials.client_secret as string,
      credentials.refresh_token as string
    );

    accessToken = newToken.access_token;
    currentExpiresAt = new Date(Date.now() + newToken.expires_in * 1000);

    // Update vault (Microsoft may return new refresh_token)
    const updates: Record<string, unknown> = {
      access_token: accessToken,
      scope: newToken.scope,
    };
    if (newToken.refresh_token) {
      updates.refresh_token = newToken.refresh_token;
    }

    await updateCredentials("microsoft_todo", updates, currentExpiresAt);

    logger.info(`Token refreshed (expires: ${currentExpiresAt.toISOString()})`);
  }

  // Cache and return
  cachedAuth = { accessToken };
  cachedExpiresAt = currentExpiresAt;

  logger.debug("Auth initialized");
  return cachedAuth;
}

// =============================================================================
// Microsoft To Do API - Lists
// =============================================================================

/**
 * Fetch all task lists
 */
export async function fetchLists(): Promise<TodoList[]> {
  const auth = await getAuthInfo();

  logger.debug("GET /me/todo/lists");
  const allLists: TodoList[] = [];
  let nextLink: string | undefined = `${GRAPH_API_BASE}/me/todo/lists`;

  while (nextLink) {
    let response: Response;
    try {
      response = await requestWithRetry("GET", nextLink, {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
    } catch (error) {
      // Token expired, refresh and retry
      if (String(error).includes("401")) {
        logger.warn("Token expired, refreshing...");
        const newAuth = await getAuthInfo(true);
        response = await requestWithRetry("GET", nextLink, {
          headers: { Authorization: `Bearer ${newAuth.accessToken}` },
        });
      } else {
        throw error;
      }
    }

    const data = (await response.json()) as {
      value?: TodoList[];
      "@odata.nextLink"?: string;
    };

    if (data.value) {
      allLists.push(...data.value);
    }

    nextLink = data["@odata.nextLink"];
    if (nextLink) {
      logger.debug("Pagination: fetching next page...");
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  logger.debug(`Response: ${allLists.length} lists total`);
  return allLists;
}

// =============================================================================
// Microsoft To Do API - Tasks
// =============================================================================

/**
 * Convert dateTimeTimeZone to UTC ISO string
 */
function convertToUtc(
  dt: { dateTime: string; timeZone: string } | null | undefined
): string | null {
  if (!dt) return null;

  try {
    // Microsoft returns dateTime without timezone info, timeZone separately
    // Create a date in the specified timezone and convert to UTC
    const date = new Date(dt.dateTime);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  } catch {
    return null;
  }
}

/**
 * Fetch tasks for a specific list
 */
export async function fetchTasks(listId: string): Promise<Record<string, unknown>[]> {
  const auth = await getAuthInfo();

  logger.debug(`GET /me/todo/lists/${listId}/tasks`);
  const allTasks: Record<string, unknown>[] = [];
  let nextLink: string | undefined = `${GRAPH_API_BASE}/me/todo/lists/${listId}/tasks`;

  while (nextLink) {
    let response: Response;
    try {
      response = await requestWithRetry("GET", nextLink, {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
    } catch (error) {
      // Token expired, refresh and retry
      if (String(error).includes("401")) {
        logger.warn("Token expired, refreshing...");
        const newAuth = await getAuthInfo(true);
        response = await requestWithRetry("GET", nextLink, {
          headers: { Authorization: `Bearer ${newAuth.accessToken}` },
        });
      } else {
        throw error;
      }
    }

    const data = (await response.json()) as {
      value?: Record<string, unknown>[];
      "@odata.nextLink"?: string;
    };

    if (data.value) {
      // Add listId and UTC conversions to each task
      for (const task of data.value) {
        task.listId = listId;

        // Add UTC conversions for datetime fields
        const completedDateTime = task.completedDateTime as { dateTime: string; timeZone: string } | null;
        const dueDateTime = task.dueDateTime as { dateTime: string; timeZone: string } | null;
        const startDateTime = task.startDateTime as { dateTime: string; timeZone: string } | null;

        task._completedDateTime_utc = convertToUtc(completedDateTime);
        task._dueDateTime_utc = convertToUtc(dueDateTime);
        task._startDateTime_utc = convertToUtc(startDateTime);
      }
      allTasks.push(...data.value);
    }

    nextLink = data["@odata.nextLink"];
    if (nextLink) {
      logger.debug("Pagination: fetching next page...");
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  logger.debug(`Response: ${allTasks.length} tasks for list ${listId}`);
  return allTasks;
}

/**
 * Fetch all tasks from all lists
 */
export async function fetchAllTasks(): Promise<Record<string, unknown>[]> {
  const lists = await fetchLists();

  logger.info(`Fetching tasks from ${lists.length} lists...`);

  const allTasks: Record<string, unknown>[] = [];

  for (const list of lists) {
    const tasks = await fetchTasks(list.id);
    allTasks.push(...tasks);

    // Small delay between lists to avoid rate limits
    await new Promise((r) => setTimeout(r, 100));
  }

  logger.info(`Fetched ${allTasks.length} tasks total`);
  return allTasks;
}

// =============================================================================
// Microsoft To Do API - Checklist Items
// =============================================================================

/**
 * Fetch checklist items for a specific task
 */
export async function fetchChecklistItems(
  listId: string,
  taskId: string
): Promise<Record<string, unknown>[]> {
  const auth = await getAuthInfo();

  logger.debug(`GET /me/todo/lists/${listId}/tasks/${taskId}/checklistItems`);
  const allItems: Record<string, unknown>[] = [];
  let nextLink: string | undefined = `${GRAPH_API_BASE}/me/todo/lists/${listId}/tasks/${taskId}/checklistItems`;

  while (nextLink) {
    let response: Response;
    try {
      response = await requestWithRetry("GET", nextLink, {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
    } catch (error) {
      // Token expired, refresh and retry
      if (String(error).includes("401")) {
        logger.warn("Token expired, refreshing...");
        const newAuth = await getAuthInfo(true);
        response = await requestWithRetry("GET", nextLink, {
          headers: { Authorization: `Bearer ${newAuth.accessToken}` },
        });
      } else {
        throw error;
      }
    }

    const data = (await response.json()) as {
      value?: Record<string, unknown>[];
      "@odata.nextLink"?: string;
    };

    if (data.value) {
      // Add listId and taskId to each item
      for (const item of data.value) {
        item.listId = listId;
        item.taskId = taskId;

        // Add UTC conversion for checkedDateTime
        const checkedDateTime = item.checkedDateTime as { dateTime: string; timeZone: string } | null;
        item._checkedDateTime_utc = convertToUtc(checkedDateTime);
      }
      allItems.push(...data.value);
    }

    nextLink = data["@odata.nextLink"];
    if (nextLink) {
      logger.debug("Pagination: fetching next page...");
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return allItems;
}

/**
 * Fetch all checklist items from all tasks
 */
export async function fetchAllChecklistItems(): Promise<Record<string, unknown>[]> {
  const lists = await fetchLists();

  logger.info(`Fetching checklist items from ${lists.length} lists...`);

  const allChecklistItems: Record<string, unknown>[] = [];

  for (const list of lists) {
    const tasks = await fetchTasks(list.id);

    for (const task of tasks) {
      const taskId = task.id as string;
      const checklistItems = await fetchChecklistItems(list.id, taskId);
      allChecklistItems.push(...checklistItems);

      // Small delay between tasks to avoid rate limits
      if (checklistItems.length > 0) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    // Small delay between lists
    await new Promise((r) => setTimeout(r, 100));
  }

  logger.info(`Fetched ${allChecklistItems.length} checklist items total`);
  return allChecklistItems;
}
