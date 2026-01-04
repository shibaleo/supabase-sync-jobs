// Atlassian API Client
// Shared authentication + Jira + Confluence API functions

import { createClient } from "@supabase/supabase-js";

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  return createClient(supabaseUrl, supabaseKey);
}

export interface AtlassianCredentials {
  email: string;
  api_token: string;
  domain: string;
}

let cachedCredentials: AtlassianCredentials | null = null;

export async function getCredentials(): Promise<AtlassianCredentials> {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("console")
    .rpc("get_service_secret", { service_name: "atlassian" });

  if (error || !data) {
    throw new Error("Atlassian credentials not found in vault");
  }

  const credentials = data as AtlassianCredentials;

  if (!credentials.email || !credentials.api_token || !credentials.domain) {
    throw new Error("Missing Atlassian credentials. Configure in Console first.");
  }

  cachedCredentials = credentials;
  return credentials;
}

export interface AtlassianApiError {
  status: number;
  errorMessages?: string[];
  errors?: Record<string, string>;
  message?: string;
}

async function atlassianRequest<T>(
  method: string,
  baseUrl: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  const credentials = await getCredentials();
  const auth = `Basic ${btoa(`${credentials.email}:${credentials.api_token}`)}`;
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
    const errorData = await response.json().catch(() => ({})) as AtlassianApiError;
    throw {
      status: response.status,
      errorMessages: errorData.errorMessages || errorData.message
        ? [errorData.message || `Atlassian API error: ${response.status}`]
        : [`Atlassian API error: ${response.status}`],
      errors: errorData.errors,
    } as AtlassianApiError;
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// =============================================================================
// JIRA API
// =============================================================================

const JIRA_API = "/rest/api/3";

function jiraRequest<T>(method: string, endpoint: string, body?: Record<string, unknown>): Promise<T> {
  return atlassianRequest<T>(method, JIRA_API, endpoint, body);
}

// User
export interface JiraUser {
  accountId: string;
  accountType: string;
  displayName: string;
  emailAddress?: string;
  active: boolean;
  timeZone?: string;
}

export function jiraGetMyself(): Promise<JiraUser> {
  return jiraRequest<JiraUser>("GET", "/myself");
}

// Projects
export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

export interface JiraProjectListResponse {
  values: JiraProject[];
  startAt: number;
  maxResults: number;
  total: number;
  isLast: boolean;
}

export function jiraListProjects(startAt = 0, maxResults = 50): Promise<JiraProjectListResponse> {
  return jiraRequest<JiraProjectListResponse>("GET", `/project/search?startAt=${startAt}&maxResults=${maxResults}`);
}

export function jiraGetProject(projectKeyOrId: string): Promise<JiraProject> {
  return jiraRequest<JiraProject>("GET", `/project/${projectKeyOrId}`);
}

// Issues
export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: unknown;
    status?: { name: string; id: string };
    priority?: { name: string; id: string };
    issuetype?: { name: string; id: string };
    assignee?: JiraUser;
    reporter?: JiraUser;
    created?: string;
    updated?: string;
    labels?: string[];
    project?: { key: string; name: string };
    parent?: { key: string; fields?: { summary: string } };
    [key: string]: unknown;
  };
}

export interface JiraIssueSearchResponse {
  issues: JiraIssue[];
  startAt: number;
  maxResults: number;
  total: number;
}

export function jiraSearch(jql: string, startAt = 0, maxResults = 50, fields?: string[]): Promise<JiraIssueSearchResponse> {
  const params = new URLSearchParams({ jql, startAt: startAt.toString(), maxResults: maxResults.toString() });
  if (fields?.length) params.set("fields", fields.join(","));
  return jiraRequest<JiraIssueSearchResponse>("GET", `/search/jql?${params}`);
}

export function jiraGetIssue(issueKeyOrId: string, fields?: string[]): Promise<JiraIssue> {
  const params = new URLSearchParams();
  if (fields?.length) params.set("fields", fields.join(","));
  const query = params.toString() ? `?${params}` : "";
  return jiraRequest<JiraIssue>("GET", `/issue/${issueKeyOrId}${query}`);
}

export interface JiraCreateIssueParams {
  projectKey: string;
  issueType: string;
  summary: string;
  description?: string;
  assigneeAccountId?: string;
  priority?: string;
  labels?: string[];
  parentKey?: string;
}

export function jiraCreateIssue(params: JiraCreateIssueParams): Promise<JiraIssue> {
  const fields: Record<string, unknown> = {
    project: { key: params.projectKey },
    issuetype: { name: params.issueType },
    summary: params.summary,
  };
  if (params.description) {
    fields.description = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: params.description }] }] };
  }
  if (params.assigneeAccountId) fields.assignee = { accountId: params.assigneeAccountId };
  if (params.priority) fields.priority = { name: params.priority };
  if (params.labels) fields.labels = params.labels;
  if (params.parentKey) fields.parent = { key: params.parentKey };
  return jiraRequest<JiraIssue>("POST", "/issue", { fields });
}

export interface JiraUpdateIssueParams {
  issueKeyOrId: string;
  summary?: string;
  description?: string;
  assigneeAccountId?: string;
  priority?: string;
  labels?: string[];
}

export async function jiraUpdateIssue(params: JiraUpdateIssueParams): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (params.summary !== undefined) fields.summary = params.summary;
  if (params.description !== undefined) {
    fields.description = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: params.description }] }] };
  }
  if (params.assigneeAccountId !== undefined) fields.assignee = { accountId: params.assigneeAccountId };
  if (params.priority !== undefined) fields.priority = { name: params.priority };
  if (params.labels !== undefined) fields.labels = params.labels;
  await jiraRequest<void>("PUT", `/issue/${params.issueKeyOrId}`, { fields });
}

// Transitions
export interface JiraTransition {
  id: string;
  name: string;
  to: { name: string; id: string };
}

export interface JiraTransitionsResponse {
  transitions: JiraTransition[];
}

export function jiraGetTransitions(issueKeyOrId: string): Promise<JiraTransitionsResponse> {
  return jiraRequest<JiraTransitionsResponse>("GET", `/issue/${issueKeyOrId}/transitions`);
}

export async function jiraTransitionIssue(issueKeyOrId: string, transitionId: string, comment?: string): Promise<void> {
  const body: Record<string, unknown> = { transition: { id: transitionId } };
  if (comment) {
    body.update = { comment: [{ add: { body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: comment }] }] } } }] };
  }
  await jiraRequest<void>("POST", `/issue/${issueKeyOrId}/transitions`, body);
}

// Comments
export interface JiraComment {
  id: string;
  author: JiraUser;
  body: unknown;
  created: string;
  updated: string;
}

export interface JiraCommentsResponse {
  comments: JiraComment[];
  startAt: number;
  maxResults: number;
  total: number;
}

export function jiraGetComments(issueKeyOrId: string, startAt = 0, maxResults = 50): Promise<JiraCommentsResponse> {
  return jiraRequest<JiraCommentsResponse>("GET", `/issue/${issueKeyOrId}/comment?startAt=${startAt}&maxResults=${maxResults}`);
}

export function jiraAddComment(issueKeyOrId: string, body: string): Promise<JiraComment> {
  return jiraRequest<JiraComment>("POST", `/issue/${issueKeyOrId}/comment`, {
    body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: body }] }] },
  });
}

// Worklogs
export interface JiraWorklog {
  id: string;
  author: JiraUser;
  created: string;
  updated: string;
  started: string;
  timeSpent: string;
  timeSpentSeconds: number;
  comment?: unknown;
}

export interface JiraWorklogsResponse {
  worklogs: JiraWorklog[];
  startAt: number;
  maxResults: number;
  total: number;
}

export function jiraGetWorklogs(issueKeyOrId: string, startAt = 0, maxResults = 50): Promise<JiraWorklogsResponse> {
  return jiraRequest<JiraWorklogsResponse>("GET", `/issue/${issueKeyOrId}/worklog?startAt=${startAt}&maxResults=${maxResults}`);
}

export interface JiraAddWorklogParams {
  issueKeyOrId: string;
  timeSpentSeconds: number;
  started?: string;
  comment?: string;
}

export function jiraAddWorklog(params: JiraAddWorklogParams): Promise<JiraWorklog> {
  const body: Record<string, unknown> = { timeSpentSeconds: params.timeSpentSeconds };
  if (params.started) body.started = params.started;
  if (params.comment) {
    body.comment = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: params.comment }] }] };
  }
  return jiraRequest<JiraWorklog>("POST", `/issue/${params.issueKeyOrId}/worklog`, body);
}

// Issue Types & Priorities
export interface JiraIssueType {
  id: string;
  name: string;
  description: string;
  subtask: boolean;
}

export async function jiraGetProjectIssueTypes(projectKeyOrId: string): Promise<JiraIssueType[]> {
  const project = await jiraRequest<{ issueTypes: JiraIssueType[] }>("GET", `/project/${projectKeyOrId}?expand=issueTypes`);
  return project.issueTypes;
}

export interface JiraPriority {
  id: string;
  name: string;
  description: string;
}

export function jiraGetPriorities(): Promise<JiraPriority[]> {
  return jiraRequest<JiraPriority[]>("GET", "/priority");
}

// =============================================================================
// CONFLUENCE API
// =============================================================================

const CONFLUENCE_API_V2 = "/wiki/api/v2";
const CONFLUENCE_API_V1 = "/wiki/rest/api";

function confluenceV2Request<T>(method: string, endpoint: string, body?: Record<string, unknown>): Promise<T> {
  return atlassianRequest<T>(method, CONFLUENCE_API_V2, endpoint, body);
}

function confluenceV1Request<T>(method: string, endpoint: string, body?: Record<string, unknown>): Promise<T> {
  return atlassianRequest<T>(method, CONFLUENCE_API_V1, endpoint, body);
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

export function confluenceListSpaces(limit = 25, cursor?: string): Promise<ConfluenceSpaceListResponse> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (cursor) params.set("cursor", cursor);
  return confluenceV2Request<ConfluenceSpaceListResponse>("GET", `/spaces?${params}`);
}

export function confluenceGetSpace(spaceId: string): Promise<ConfluenceSpace> {
  return confluenceV2Request<ConfluenceSpace>("GET", `/spaces/${spaceId}`);
}

// Get space by key (uses v1 API)
export async function confluenceGetSpaceByKey(spaceKey: string): Promise<ConfluenceSpace> {
  const result = await confluenceV1Request<{ id: number; key: string; name: string; type: string; status: string }>(
    "GET",
    `/space/${spaceKey}`
  );
  return { id: result.id.toString(), key: result.key, name: result.name, type: result.type, status: result.status };
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

export function confluenceGetPages(spaceId: string, limit = 25, cursor?: string): Promise<ConfluencePageListResponse> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (cursor) params.set("cursor", cursor);
  return confluenceV2Request<ConfluencePageListResponse>("GET", `/spaces/${spaceId}/pages?${params}`);
}

export function confluenceGetPage(pageId: string, bodyFormat: "storage" | "atlas_doc_format" = "storage"): Promise<ConfluencePage> {
  return confluenceV2Request<ConfluencePage>("GET", `/pages/${pageId}?body-format=${bodyFormat}`);
}

export interface ConfluenceCreatePageParams {
  spaceId: string;
  title: string;
  body: string;
  parentId?: string;
}

export function confluenceCreatePage(params: ConfluenceCreatePageParams): Promise<ConfluencePage> {
  const body: Record<string, unknown> = {
    spaceId: params.spaceId,
    title: params.title,
    status: "current",
    body: { representation: "storage", value: params.body },
  };
  if (params.parentId) body.parentId = params.parentId;
  return confluenceV2Request<ConfluencePage>("POST", "/pages", body);
}

export interface ConfluenceUpdatePageParams {
  pageId: string;
  title: string;
  body: string;
  version: number;
}

export function confluenceUpdatePage(params: ConfluenceUpdatePageParams): Promise<ConfluencePage> {
  return confluenceV2Request<ConfluencePage>("PUT", `/pages/${params.pageId}`, {
    id: params.pageId,
    title: params.title,
    status: "current",
    body: { representation: "storage", value: params.body },
    version: { number: params.version },
  });
}

export async function confluenceDeletePage(pageId: string): Promise<void> {
  await confluenceV2Request<void>("DELETE", `/pages/${pageId}`);
}

// Search (CQL) - uses v1 API
export interface ConfluenceSearchResult {
  content?: { id: string; type: string; title: string; space?: { key: string; name: string } };
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

export function confluenceSearch(cql: string, limit = 25, start = 0): Promise<ConfluenceSearchResponse> {
  const params = new URLSearchParams({ cql, limit: limit.toString(), start: start.toString() });
  return confluenceV1Request<ConfluenceSearchResponse>("GET", `/search?${params}`);
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

export function confluenceGetPageComments(pageId: string, limit = 25, cursor?: string): Promise<ConfluenceCommentListResponse> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (cursor) params.set("cursor", cursor);
  return confluenceV2Request<ConfluenceCommentListResponse>("GET", `/pages/${pageId}/footer-comments?${params}`);
}

export function confluenceAddPageComment(pageId: string, body: string): Promise<ConfluenceComment> {
  return confluenceV2Request<ConfluenceComment>("POST", `/pages/${pageId}/footer-comments`, {
    body: { representation: "storage", value: body },
  });
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

export function confluenceGetPageLabels(pageId: string): Promise<ConfluenceLabelListResponse> {
  return confluenceV2Request<ConfluenceLabelListResponse>("GET", `/pages/${pageId}/labels`);
}

export function confluenceAddPageLabel(pageId: string, label: string): Promise<ConfluenceLabel> {
  return confluenceV2Request<ConfluenceLabel>("POST", `/pages/${pageId}/labels`, { name: label });
}
