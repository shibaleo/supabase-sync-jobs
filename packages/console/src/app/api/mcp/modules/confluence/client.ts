// Confluence API Client for MCP
// Uses user-specific credentials stored in Supabase Vault

import { getUserSecret } from "../../lib/vault";

export interface AtlassianCredentials {
  email: string;
  api_token: string;
  domain: string;
}

// Cache per user
const credentialsCache = new Map<string, AtlassianCredentials>();

export async function getCredentials(userId: string): Promise<AtlassianCredentials> {
  const cached = credentialsCache.get(userId);
  if (cached) return cached;

  const data = await getUserSecret(userId, "atlassian");

  if (!data) {
    throw new Error(`Atlassian credentials not found in vault for user ${userId}`);
  }

  const credentials = data as unknown as AtlassianCredentials;
  if (!credentials.email || !credentials.api_token || !credentials.domain) {
    throw new Error("Missing Atlassian credentials. Configure in Console first.");
  }

  credentialsCache.set(userId, credentials);
  return credentials;
}

export interface AtlassianApiError {
  status: number;
  errorMessages?: string[];
  errors?: Record<string, string>;
  message?: string;
}

async function confluenceRequest<T>(
  userId: string,
  method: string,
  baseUrl: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  const credentials = await getCredentials(userId);
  const auth = `Basic ${Buffer.from(`${credentials.email}:${credentials.api_token}`).toString("base64")}`;
  const url = `https://${credentials.domain}${baseUrl}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as AtlassianApiError;
    throw {
      status: response.status,
      errorMessages: errorData.errorMessages || errorData.message
        ? [errorData.message || `Confluence API error: ${response.status}`]
        : [`Confluence API error: ${response.status}`],
      errors: errorData.errors,
    } as AtlassianApiError;
  }

  if (response.status === 204) return {} as T;
  return response.json();
}

// =============================================================================
// CONFLUENCE API
// =============================================================================

const CONFLUENCE_API_V2 = "/wiki/api/v2";
const CONFLUENCE_API_V1 = "/wiki/rest/api";

function confluenceV2Request<T>(
  userId: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  return confluenceRequest<T>(userId, method, CONFLUENCE_API_V2, endpoint, body);
}

function confluenceV1Request<T>(
  userId: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  return confluenceRequest<T>(userId, method, CONFLUENCE_API_V1, endpoint, body);
}

// Spaces
export interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
  type: string;
  status: string;
  description?: { plain?: { value: string } };
}

export interface ConfluenceSpaceListResponse {
  results: ConfluenceSpace[];
  _links?: { next?: string };
}

export function confluenceListSpaces(
  userId: string,
  limit = 25,
  cursor?: string
): Promise<ConfluenceSpaceListResponse> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (cursor) params.set("cursor", cursor);
  return confluenceV2Request<ConfluenceSpaceListResponse>(userId, "GET", `/spaces?${params}`);
}

export function confluenceGetSpace(userId: string, spaceId: string): Promise<ConfluenceSpace> {
  return confluenceV2Request<ConfluenceSpace>(userId, "GET", `/spaces/${spaceId}`);
}

// Get space by key (uses v1 API)
export async function confluenceGetSpaceByKey(userId: string, spaceKey: string): Promise<ConfluenceSpace> {
  const result = await confluenceV1Request<{
    id: number;
    key: string;
    name: string;
    type: string;
    status: string;
  }>(userId, "GET", `/space/${spaceKey}`);
  return {
    id: result.id.toString(),
    key: result.key,
    name: result.name,
    type: result.type,
    status: result.status,
  };
}

// Pages
export interface ConfluencePage {
  id: string;
  title: string;
  status: string;
  spaceId?: string;
  parentId?: string;
  parentType?: string;
  version?: { number: number; createdAt: string };
  body?: { storage?: { value: string }; atlas_doc_format?: { value: string } };
  _links?: { webui?: string };
}

export interface ConfluencePageListResponse {
  results: ConfluencePage[];
  _links?: { next?: string };
}

export function confluenceGetPages(
  userId: string,
  spaceId: string,
  limit = 25,
  cursor?: string
): Promise<ConfluencePageListResponse> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (cursor) params.set("cursor", cursor);
  return confluenceV2Request<ConfluencePageListResponse>(
    userId,
    "GET",
    `/spaces/${spaceId}/pages?${params}`
  );
}

export function confluenceGetPage(
  userId: string,
  pageId: string,
  bodyFormat: "storage" | "atlas_doc_format" = "storage"
): Promise<ConfluencePage> {
  return confluenceV2Request<ConfluencePage>(
    userId,
    "GET",
    `/pages/${pageId}?body-format=${bodyFormat}`
  );
}

export interface ConfluenceCreatePageParams {
  spaceId: string;
  title: string;
  body: string;
  parentId?: string;
}

export function confluenceCreatePage(
  userId: string,
  params: ConfluenceCreatePageParams
): Promise<ConfluencePage> {
  const body: Record<string, unknown> = {
    spaceId: params.spaceId,
    title: params.title,
    status: "current",
    body: { representation: "storage", value: params.body },
  };
  if (params.parentId) body.parentId = params.parentId;
  return confluenceV2Request<ConfluencePage>(userId, "POST", "/pages", body);
}

export interface ConfluenceUpdatePageParams {
  pageId: string;
  title: string;
  body: string;
  version: number;
}

export function confluenceUpdatePage(
  userId: string,
  params: ConfluenceUpdatePageParams
): Promise<ConfluencePage> {
  return confluenceV2Request<ConfluencePage>(userId, "PUT", `/pages/${params.pageId}`, {
    id: params.pageId,
    title: params.title,
    status: "current",
    body: { representation: "storage", value: params.body },
    version: { number: params.version },
  });
}

export async function confluenceDeletePage(userId: string, pageId: string): Promise<void> {
  await confluenceV2Request<void>(userId, "DELETE", `/pages/${pageId}`);
}

// Search (CQL) - uses v1 API
export interface ConfluenceSearchResult {
  content?: {
    id: string;
    type: string;
    title: string;
    space?: { key: string; name: string };
  };
  excerpt?: string;
  url?: string;
}

export interface ConfluenceSearchResponse {
  results: ConfluenceSearchResult[];
  start: number;
  limit: number;
  size: number;
  totalSize?: number;
  _links?: { next?: string };
}

export function confluenceSearch(
  userId: string,
  cql: string,
  limit = 25,
  start = 0
): Promise<ConfluenceSearchResponse> {
  const params = new URLSearchParams({
    cql,
    limit: limit.toString(),
    start: start.toString(),
  });
  return confluenceV1Request<ConfluenceSearchResponse>(userId, "GET", `/search?${params}`);
}

// Comments
export interface ConfluenceComment {
  id: string;
  status: string;
  title: string;
  body?: { storage?: { value: string } };
  version?: { number: number; createdAt: string };
}

export interface ConfluenceCommentListResponse {
  results: ConfluenceComment[];
  _links?: { next?: string };
}

export function confluenceGetPageComments(
  userId: string,
  pageId: string,
  limit = 25,
  cursor?: string
): Promise<ConfluenceCommentListResponse> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (cursor) params.set("cursor", cursor);
  return confluenceV2Request<ConfluenceCommentListResponse>(
    userId,
    "GET",
    `/pages/${pageId}/footer-comments?${params}`
  );
}

export function confluenceAddPageComment(
  userId: string,
  pageId: string,
  body: string
): Promise<ConfluenceComment> {
  return confluenceV2Request<ConfluenceComment>(
    userId,
    "POST",
    `/pages/${pageId}/footer-comments`,
    {
      body: { representation: "storage", value: body },
    }
  );
}

// Labels
export interface ConfluenceLabel {
  id: string;
  name: string;
  prefix: string;
}

export interface ConfluenceLabelListResponse {
  results: ConfluenceLabel[];
  _links?: { next?: string };
}

export function confluenceGetPageLabels(
  userId: string,
  pageId: string
): Promise<ConfluenceLabelListResponse> {
  return confluenceV2Request<ConfluenceLabelListResponse>(
    userId,
    "GET",
    `/pages/${pageId}/labels`
  );
}

export function confluenceAddPageLabel(
  userId: string,
  pageId: string,
  label: string
): Promise<ConfluenceLabel> {
  return confluenceV2Request<ConfluenceLabel>(
    userId,
    "POST",
    `/pages/${pageId}/labels`,
    { name: label }
  );
}
