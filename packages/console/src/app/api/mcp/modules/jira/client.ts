// Jira API Client for MCP
// Uses user-specific credentials stored in Supabase Vault

import { getUserSecret } from "../../lib/vault";

const JIRA_API = "/rest/api/3";

export interface AtlassianCredentials {
  email: string;
  api_token: string;
  domain: string;
}

// Cache per user
const credentialsCache = new Map<string, AtlassianCredentials>();

async function getCredentials(userId: string): Promise<AtlassianCredentials> {
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

async function jiraRequest<T>(
  userId: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  const credentials = await getCredentials(userId);
  const auth = `Basic ${Buffer.from(`${credentials.email}:${credentials.api_token}`).toString("base64")}`;
  const url = `https://${credentials.domain}${JIRA_API}${endpoint}`;

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
        ? [errorData.message || `Jira API error: ${response.status}`]
        : [`Jira API error: ${response.status}`],
      errors: errorData.errors,
    } as AtlassianApiError;
  }

  if (response.status === 204) return {} as T;
  return response.json();
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

export function jiraGetMyself(userId: string): Promise<JiraUser> {
  return jiraRequest<JiraUser>(userId, "GET", "/myself");
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

export function jiraListProjects(userId: string, startAt = 0, maxResults = 50): Promise<JiraProjectListResponse> {
  return jiraRequest<JiraProjectListResponse>(userId, "GET", `/project/search?startAt=${startAt}&maxResults=${maxResults}`);
}

export function jiraGetProject(userId: string, projectKeyOrId: string): Promise<JiraProject> {
  return jiraRequest<JiraProject>(userId, "GET", `/project/${projectKeyOrId}`);
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

export function jiraSearch(userId: string, jql: string, startAt = 0, maxResults = 50, fields?: string[]): Promise<JiraIssueSearchResponse> {
  const params = new URLSearchParams({ jql, startAt: startAt.toString(), maxResults: maxResults.toString() });
  if (fields?.length) params.set("fields", fields.join(","));
  return jiraRequest<JiraIssueSearchResponse>(userId, "GET", `/search/jql?${params}`);
}

export function jiraGetIssue(userId: string, issueKeyOrId: string, fields?: string[]): Promise<JiraIssue> {
  const params = new URLSearchParams();
  if (fields?.length) params.set("fields", fields.join(","));
  const query = params.toString() ? `?${params}` : "";
  return jiraRequest<JiraIssue>(userId, "GET", `/issue/${issueKeyOrId}${query}`);
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

export function jiraCreateIssue(userId: string, params: JiraCreateIssueParams): Promise<JiraIssue> {
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
  return jiraRequest<JiraIssue>(userId, "POST", "/issue", { fields });
}

export interface JiraUpdateIssueParams {
  issueKeyOrId: string;
  summary?: string;
  description?: string;
  assigneeAccountId?: string;
  priority?: string;
  labels?: string[];
}

export async function jiraUpdateIssue(userId: string, params: JiraUpdateIssueParams): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (params.summary !== undefined) fields.summary = params.summary;
  if (params.description !== undefined) {
    fields.description = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: params.description }] }] };
  }
  if (params.assigneeAccountId !== undefined) fields.assignee = { accountId: params.assigneeAccountId };
  if (params.priority !== undefined) fields.priority = { name: params.priority };
  if (params.labels !== undefined) fields.labels = params.labels;
  await jiraRequest<void>(userId, "PUT", `/issue/${params.issueKeyOrId}`, { fields });
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

export function jiraGetTransitions(userId: string, issueKeyOrId: string): Promise<JiraTransitionsResponse> {
  return jiraRequest<JiraTransitionsResponse>(userId, "GET", `/issue/${issueKeyOrId}/transitions`);
}

export async function jiraTransitionIssue(userId: string, issueKeyOrId: string, transitionId: string, comment?: string): Promise<void> {
  const body: Record<string, unknown> = { transition: { id: transitionId } };
  if (comment) {
    body.update = { comment: [{ add: { body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: comment }] }] } } }] };
  }
  await jiraRequest<void>(userId, "POST", `/issue/${issueKeyOrId}/transitions`, body);
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

export function jiraGetComments(userId: string, issueKeyOrId: string, startAt = 0, maxResults = 50): Promise<JiraCommentsResponse> {
  return jiraRequest<JiraCommentsResponse>(userId, "GET", `/issue/${issueKeyOrId}/comment?startAt=${startAt}&maxResults=${maxResults}`);
}

export function jiraAddComment(userId: string, issueKeyOrId: string, body: string): Promise<JiraComment> {
  return jiraRequest<JiraComment>(userId, "POST", `/issue/${issueKeyOrId}/comment`, {
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

export function jiraGetWorklogs(userId: string, issueKeyOrId: string, startAt = 0, maxResults = 50): Promise<JiraWorklogsResponse> {
  return jiraRequest<JiraWorklogsResponse>(userId, "GET", `/issue/${issueKeyOrId}/worklog?startAt=${startAt}&maxResults=${maxResults}`);
}

export interface JiraAddWorklogParams {
  issueKeyOrId: string;
  timeSpentSeconds: number;
  started?: string;
  comment?: string;
}

export function jiraAddWorklog(userId: string, params: JiraAddWorklogParams): Promise<JiraWorklog> {
  const body: Record<string, unknown> = { timeSpentSeconds: params.timeSpentSeconds };
  if (params.started) body.started = params.started;
  if (params.comment) {
    body.comment = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: params.comment }] }] };
  }
  return jiraRequest<JiraWorklog>(userId, "POST", `/issue/${params.issueKeyOrId}/worklog`, body);
}
