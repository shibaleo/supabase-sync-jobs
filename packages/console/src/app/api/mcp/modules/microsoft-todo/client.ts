// Microsoft To Do API Client for MCP
// Uses OAuth2 tokens stored in Supabase Vault

import { createClient } from "@supabase/supabase-js";

const MS_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

interface Credentials {
  client_id: string;
  client_secret: string;
  access_token: string;
  refresh_token: string;
  _expires_at?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

// Cache
let cachedCredentials: Credentials | null = null;
let cachedExpiresAt: Date | null = null;

async function refreshAccessToken(credentials: Credentials): Promise<string> {
  const response = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: credentials.refresh_token,
      grant_type: "refresh_token",
      scope: "Tasks.ReadWrite offline_access",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh error: ${response.status} - ${text}`);
  }

  const data = (await response.json()) as TokenResponse;

  // Update vault with new token
  const supabase = getSupabaseClient();
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000);

  const updatedCredentials: Record<string, unknown> = {
    ...credentials,
    access_token: data.access_token,
    scope: data.scope,
    _expires_at: newExpiresAt.toISOString(),
    _auth_type: "oauth",
  };

  // Microsoft may return new refresh_token
  if (data.refresh_token) {
    updatedCredentials.refresh_token = data.refresh_token;
  }

  await supabase.schema("console").rpc("upsert_service_secret", {
    service_name: "microsoft_todo",
    secret_data: updatedCredentials,
    secret_description: "Microsoft To Do credentials",
  });

  // Update cache
  cachedCredentials = {
    ...credentials,
    access_token: data.access_token,
    refresh_token: data.refresh_token || credentials.refresh_token,
  };
  cachedExpiresAt = newExpiresAt;

  return data.access_token;
}

async function getAccessToken(): Promise<string> {
  const THRESHOLD_MINUTES = 5;

  // Check cache
  if (cachedCredentials && cachedExpiresAt) {
    const minutesUntilExpiry =
      (cachedExpiresAt.getTime() - Date.now()) / 1000 / 60;
    if (minutesUntilExpiry > THRESHOLD_MINUTES) {
      return cachedCredentials.access_token;
    }
  }

  // Load from vault
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("console")
    .rpc("get_service_secret", { service_name: "microsoft_todo" });

  if (error || !data) {
    throw new Error("Microsoft To Do credentials not found in vault");
  }

  const credentials = data as Credentials;

  if (!credentials.client_id || !credentials.client_secret) {
    throw new Error("Missing client_id or client_secret");
  }
  if (!credentials.access_token || !credentials.refresh_token) {
    throw new Error(
      "Missing access_token or refresh_token. Run OAuth flow first."
    );
  }

  // Check if refresh needed
  let accessToken = credentials.access_token;
  const expiresAt = credentials._expires_at
    ? new Date(credentials._expires_at)
    : null;

  const needsRefresh =
    !expiresAt ||
    (expiresAt.getTime() - Date.now()) / 1000 / 60 <= THRESHOLD_MINUTES;

  if (needsRefresh) {
    accessToken = await refreshAccessToken(credentials);
  } else {
    cachedCredentials = credentials;
    cachedExpiresAt = expiresAt;
  }

  return accessToken;
}

export interface TodoApiError {
  status: number;
  code: string;
  message: string;
}

async function todoRequest<T>(
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
  retried = false
): Promise<T> {
  const accessToken = await getAccessToken();
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${GRAPH_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    // Handle token expiry
    if (response.status === 401 && !retried) {
      // Force refresh token
      cachedCredentials = null;
      cachedExpiresAt = null;
      return todoRequest<T>(method, endpoint, body, true);
    }

    const errorData = await response.json().catch(() => ({}));
    throw {
      status: response.status,
      code:
        (errorData as { error?: { code?: string } }).error?.code ||
        "unknown_error",
      message:
        (errorData as { error?: { message?: string } }).error?.message ||
        `Microsoft Graph API error: ${response.status}`,
    } as TodoApiError;
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// =============================================================================
// Types
// =============================================================================

export interface TodoList {
  id: string;
  displayName: string;
  isOwner: boolean;
  isShared: boolean;
  wellknownListName: string;
}

export interface TodoListResponse {
  value: TodoList[];
  "@odata.nextLink"?: string;
}

export interface DateTimeTimeZone {
  dateTime: string;
  timeZone: string;
}

export interface TodoTask {
  id: string;
  title: string;
  body?: {
    content: string;
    contentType: string;
  };
  status:
    | "notStarted"
    | "inProgress"
    | "completed"
    | "waitingOnOthers"
    | "deferred";
  importance: "low" | "normal" | "high";
  isReminderOn: boolean;
  categories: string[];
  createdDateTime: string;
  lastModifiedDateTime: string;
  completedDateTime?: DateTimeTimeZone;
  dueDateTime?: DateTimeTimeZone;
  startDateTime?: DateTimeTimeZone;
  reminderDateTime?: DateTimeTimeZone;
  recurrence?: {
    pattern: {
      type: string;
      interval: number;
      daysOfWeek?: string[];
    };
    range: {
      type: string;
      startDate: string;
      endDate?: string;
    };
  };
  hasAttachments: boolean;
}

export interface TodoTaskResponse {
  value: TodoTask[];
  "@odata.nextLink"?: string;
}

// =============================================================================
// Lists
// =============================================================================

export async function listLists(): Promise<TodoList[]> {
  const allLists: TodoList[] = [];
  let nextLink: string | undefined = "/me/todo/lists";

  while (nextLink) {
    const res: TodoListResponse = await todoRequest<TodoListResponse>("GET", nextLink);
    if (res.value) {
      allLists.push(...res.value);
    }
    nextLink = res["@odata.nextLink"];
  }

  return allLists;
}

export async function getList(listId: string): Promise<TodoList> {
  return todoRequest<TodoList>("GET", `/me/todo/lists/${listId}`);
}

export interface CreateListParams {
  displayName: string;
}

export async function createList(params: CreateListParams): Promise<TodoList> {
  return todoRequest<TodoList>("POST", "/me/todo/lists", {
    displayName: params.displayName,
  });
}

export async function updateList(
  listId: string,
  displayName: string
): Promise<TodoList> {
  return todoRequest<TodoList>("PATCH", `/me/todo/lists/${listId}`, {
    displayName,
  });
}

export async function deleteList(listId: string): Promise<void> {
  await todoRequest<void>("DELETE", `/me/todo/lists/${listId}`);
}

// =============================================================================
// Tasks
// =============================================================================

export interface ListTasksParams {
  listId: string;
  filter?: string;
  top?: number;
}

export async function listTasks(params: ListTasksParams): Promise<TodoTask[]> {
  const { listId, filter, top } = params;

  const query = new URLSearchParams();
  if (filter) query.set("$filter", filter);
  if (top) query.set("$top", top.toString());

  const allTasks: TodoTask[] = [];
  let nextLink: string | undefined = `/me/todo/lists/${listId}/tasks${query.toString() ? `?${query}` : ""}`;

  while (nextLink) {
    const res: TodoTaskResponse = await todoRequest<TodoTaskResponse>("GET", nextLink);
    if (res.value) {
      allTasks.push(...res.value);
    }
    nextLink = res["@odata.nextLink"];
  }

  return allTasks;
}

export async function getTask(
  listId: string,
  taskId: string
): Promise<TodoTask> {
  return todoRequest<TodoTask>(
    "GET",
    `/me/todo/lists/${listId}/tasks/${taskId}`
  );
}

export interface CreateTaskParams {
  listId: string;
  title: string;
  body?: string;
  importance?: "low" | "normal" | "high";
  status?:
    | "notStarted"
    | "inProgress"
    | "completed"
    | "waitingOnOthers"
    | "deferred";
  dueDateTime?: DateTimeTimeZone;
  startDateTime?: DateTimeTimeZone;
  reminderDateTime?: DateTimeTimeZone;
  categories?: string[];
  isReminderOn?: boolean;
}

export async function createTask(params: CreateTaskParams): Promise<TodoTask> {
  const {
    listId,
    title,
    body,
    importance,
    status,
    dueDateTime,
    startDateTime,
    reminderDateTime,
    categories,
    isReminderOn,
  } = params;

  const taskBody: Record<string, unknown> = { title };
  if (body) taskBody.body = { content: body, contentType: "text" };
  if (importance) taskBody.importance = importance;
  if (status) taskBody.status = status;
  if (dueDateTime) taskBody.dueDateTime = dueDateTime;
  if (startDateTime) taskBody.startDateTime = startDateTime;
  if (reminderDateTime) taskBody.reminderDateTime = reminderDateTime;
  if (categories) taskBody.categories = categories;
  if (isReminderOn !== undefined) taskBody.isReminderOn = isReminderOn;

  return todoRequest<TodoTask>(
    "POST",
    `/me/todo/lists/${listId}/tasks`,
    taskBody
  );
}

export interface UpdateTaskParams {
  listId: string;
  taskId: string;
  title?: string;
  body?: string;
  importance?: "low" | "normal" | "high";
  status?:
    | "notStarted"
    | "inProgress"
    | "completed"
    | "waitingOnOthers"
    | "deferred";
  dueDateTime?: DateTimeTimeZone | null;
  startDateTime?: DateTimeTimeZone | null;
  reminderDateTime?: DateTimeTimeZone | null;
  categories?: string[];
  isReminderOn?: boolean;
}

export async function updateTask(params: UpdateTaskParams): Promise<TodoTask> {
  const {
    listId,
    taskId,
    title,
    body,
    importance,
    status,
    dueDateTime,
    startDateTime,
    reminderDateTime,
    categories,
    isReminderOn,
  } = params;

  const taskBody: Record<string, unknown> = {};
  if (title !== undefined) taskBody.title = title;
  if (body !== undefined) taskBody.body = { content: body, contentType: "text" };
  if (importance !== undefined) taskBody.importance = importance;
  if (status !== undefined) taskBody.status = status;
  if (dueDateTime !== undefined) taskBody.dueDateTime = dueDateTime;
  if (startDateTime !== undefined) taskBody.startDateTime = startDateTime;
  if (reminderDateTime !== undefined)
    taskBody.reminderDateTime = reminderDateTime;
  if (categories !== undefined) taskBody.categories = categories;
  if (isReminderOn !== undefined) taskBody.isReminderOn = isReminderOn;

  return todoRequest<TodoTask>(
    "PATCH",
    `/me/todo/lists/${listId}/tasks/${taskId}`,
    taskBody
  );
}

export async function completeTask(
  listId: string,
  taskId: string
): Promise<TodoTask> {
  return updateTask({
    listId,
    taskId,
    status: "completed",
  });
}

export async function deleteTask(
  listId: string,
  taskId: string
): Promise<void> {
  await todoRequest<void>("DELETE", `/me/todo/lists/${listId}/tasks/${taskId}`);
}
