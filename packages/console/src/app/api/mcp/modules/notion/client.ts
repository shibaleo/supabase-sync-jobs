// Notion API Client
// API Version: 2022-06-28 (stable, widely compatible)

import { getUserSecret } from "../../lib/vault";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// Token cache per user
const tokenCache = new Map<string, string>();

async function getNotionToken(userId: string): Promise<string> {
  const cached = tokenCache.get(userId);
  if (cached) return cached;

  const data = await getUserSecret(userId, "notion");

  if (!data?.api_token) {
    throw new Error(`Notion API token not found in vault for user ${userId}`);
  }

  const token = data.api_token as string;
  tokenCache.set(userId, token);
  return token;
}

export interface NotionApiError {
  status: number;
  code: string;
  message: string;
}

export async function notionRequest<T>(
  userId: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  const token = await getNotionToken(userId);
  const url = `${NOTION_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw {
      status: response.status,
      code: errorData.code || "unknown_error",
      message: errorData.message || `Notion API error: ${response.status}`,
    } as NotionApiError;
  }

  return response.json();
}

// =============================================================================
// Search
// =============================================================================
export interface SearchParams {
  query?: string;
  filter?: { property: "object"; value: "page" | "database" };
  sort?: {
    direction: "ascending" | "descending";
    timestamp: "last_edited_time";
  };
  start_cursor?: string;
  page_size?: number;
}

export async function search(userId: string, params: SearchParams) {
  return notionRequest<NotionListResponse>(userId, "POST", "/search", params as unknown as Record<string, unknown>);
}

// =============================================================================
// Pages
// =============================================================================
export async function retrievePage(userId: string, pageId: string) {
  return notionRequest<NotionPage>(userId, "GET", `/pages/${pageId}`);
}

export async function createPage(userId: string, params: {
  parent: { page_id?: string; database_id?: string };
  properties: Record<string, unknown>;
  children?: NotionBlock[];
}) {
  return notionRequest<NotionPage>(userId, "POST", "/pages", params);
}

export async function updatePage(
  userId: string,
  pageId: string,
  properties: Record<string, unknown>
) {
  return notionRequest<NotionPage>(userId, "PATCH", `/pages/${pageId}`, { properties });
}

// =============================================================================
// Databases
// =============================================================================
export async function queryDatabase(
  userId: string,
  databaseId: string,
  params?: {
    filter?: Record<string, unknown>;
    sorts?: Array<{
      property?: string;
      timestamp?: string;
      direction: "ascending" | "descending";
    }>;
    start_cursor?: string;
    page_size?: number;
  }
) {
  return notionRequest<NotionListResponse>(
    userId,
    "POST",
    `/databases/${databaseId}/query`,
    params || {}
  );
}

export async function retrieveDatabase(userId: string, databaseId: string) {
  return notionRequest<NotionDatabase>(userId, "GET", `/databases/${databaseId}`);
}

// =============================================================================
// Blocks
// =============================================================================
export async function retrieveBlockChildren(
  userId: string,
  blockId: string,
  params?: { start_cursor?: string; page_size?: number }
) {
  const query = new URLSearchParams();
  if (params?.start_cursor) query.set("start_cursor", params.start_cursor);
  if (params?.page_size) query.set("page_size", params.page_size.toString());
  const queryStr = query.toString();
  return notionRequest<NotionListResponse>(
    userId,
    "GET",
    `/blocks/${blockId}/children${queryStr ? `?${queryStr}` : ""}`
  );
}

export async function appendBlockChildren(
  userId: string,
  blockId: string,
  children: NotionBlock[]
) {
  return notionRequest<NotionListResponse>(
    userId,
    "PATCH",
    `/blocks/${blockId}/children`,
    { children }
  );
}

export async function deleteBlock(userId: string, blockId: string) {
  return notionRequest<NotionBlock>(userId, "DELETE", `/blocks/${blockId}`);
}

// =============================================================================
// Comments
// =============================================================================
export async function listComments(
  userId: string,
  blockId: string,
  params?: { start_cursor?: string; page_size?: number }
) {
  const query = new URLSearchParams({ block_id: blockId });
  if (params?.start_cursor) query.set("start_cursor", params.start_cursor);
  if (params?.page_size) query.set("page_size", params.page_size.toString());
  return notionRequest<NotionListResponse>(userId, "GET", `/comments?${query}`);
}

export async function createComment(userId: string, params: {
  parent: { page_id: string };
  rich_text: Array<{ text: { content: string } }>;
}) {
  return notionRequest<NotionComment>(userId, "POST", "/comments", params);
}

// =============================================================================
// Users
// =============================================================================
export async function listUsers(userId: string, params?: {
  start_cursor?: string;
  page_size?: number;
}) {
  const query = new URLSearchParams();
  if (params?.start_cursor) query.set("start_cursor", params.start_cursor);
  if (params?.page_size) query.set("page_size", params.page_size.toString());
  const queryStr = query.toString();
  return notionRequest<NotionListResponse>(
    userId,
    "GET",
    `/users${queryStr ? `?${queryStr}` : ""}`
  );
}

export async function retrieveUser(userId: string, notionUserId: string) {
  return notionRequest<NotionUser>(userId, "GET", `/users/${notionUserId}`);
}

export async function retrieveBotUser(userId: string) {
  return notionRequest<NotionUser>(userId, "GET", "/users/me");
}

// =============================================================================
// Types
// =============================================================================
export interface NotionListResponse {
  object: "list";
  results: unknown[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface NotionPage {
  object: "page";
  id: string;
  created_time: string;
  last_edited_time: string;
  parent: { type: string; [key: string]: unknown };
  properties: Record<string, unknown>;
  url: string;
}

export interface NotionDatabase {
  object: "database";
  id: string;
  title: Array<{ plain_text: string }>;
  properties: Record<string, unknown>;
}

export interface NotionBlock {
  object: "block";
  id?: string;
  type: string;
  [key: string]: unknown;
}

export interface NotionComment {
  object: "comment";
  id: string;
  parent: { type: string; [key: string]: unknown };
  rich_text: Array<{ plain_text: string }>;
}

export interface NotionUser {
  object: "user";
  id: string;
  name: string;
  type: "person" | "bot";
}
