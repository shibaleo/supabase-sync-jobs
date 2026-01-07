// GitHub API Client for MCP
// Uses user-specific credentials stored in Supabase Vault

import { getUserSecret } from "../../lib/vault";

interface GitHubCredentials {
  pat: string;
}

// Cache per user
const credentialsCache = new Map<string, GitHubCredentials>();

async function getCredentials(userId: string): Promise<GitHubCredentials> {
  const cached = credentialsCache.get(userId);
  if (cached) return cached;

  const data = await getUserSecret(userId, "github_mcp");

  if (!data) {
    throw new Error(`GitHub credentials not found in vault for user ${userId}`);
  }

  const credentials = data as unknown as GitHubCredentials;
  if (!credentials.pat) {
    throw new Error("Missing GitHub PAT. Configure in Console first.");
  }

  credentialsCache.set(userId, credentials);
  return credentials;
}

const GITHUB_API_BASE = "https://api.github.com";

async function githubRequest<T>(
  userId: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  const credentials = await getCredentials(userId);
  const url = `${GITHUB_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${credentials.pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `GitHub API error: ${response.status}`
    );
  }

  if (response.status === 204) return {} as T;
  return response.json();
}

// =============================================================================
// User
// =============================================================================

export interface GitHubUser {
  login: string;
  id: number;
  name?: string;
  email?: string;
  avatar_url: string;
  html_url: string;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
}

export async function getUser(userId: string): Promise<GitHubUser> {
  return githubRequest<GitHubUser>(userId, "GET", "/user");
}

// =============================================================================
// Repositories
// =============================================================================

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description?: string;
  fork: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  stargazers_count: number;
  watchers_count: number;
  forks_count: number;
  language?: string;
  default_branch: string;
}

export async function listRepos(
  userId: string,
  type: "all" | "owner" | "public" | "private" = "owner",
  sort: "created" | "updated" | "pushed" | "full_name" = "updated",
  perPage = 30,
  page = 1
): Promise<GitHubRepo[]> {
  return githubRequest<GitHubRepo[]>(
    userId,
    "GET",
    `/user/repos?type=${type}&sort=${sort}&per_page=${perPage}&page=${page}`
  );
}

export async function getRepo(userId: string, owner: string, repo: string): Promise<GitHubRepo> {
  return githubRequest<GitHubRepo>(userId, "GET", `/repos/${owner}/${repo}`);
}

export interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

export async function listBranches(
  userId: string,
  owner: string,
  repo: string,
  perPage = 30
): Promise<GitHubBranch[]> {
  return githubRequest<GitHubBranch[]>(
    userId,
    "GET",
    `/repos/${owner}/${repo}/branches?per_page=${perPage}`
  );
}

export interface GitHubCommit {
  sha: string;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
  };
  html_url: string;
  author?: {
    login: string;
  };
}

export async function listCommits(
  userId: string,
  owner: string,
  repo: string,
  sha?: string,
  perPage = 30,
  page = 1
): Promise<GitHubCommit[]> {
  const params = new URLSearchParams({
    per_page: perPage.toString(),
    page: page.toString(),
  });
  if (sha) params.set("sha", sha);
  return githubRequest<GitHubCommit[]>(
    userId,
    "GET",
    `/repos/${owner}/${repo}/commits?${params}`
  );
}

export interface GitHubContent {
  type: "file" | "dir" | "symlink" | "submodule";
  name: string;
  path: string;
  sha: string;
  size?: number;
  url: string;
  html_url: string;
  download_url?: string;
  content?: string;
  encoding?: string;
}

export async function getFileContent(
  userId: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<GitHubContent> {
  const params = ref ? `?ref=${ref}` : "";
  return githubRequest<GitHubContent>(
    userId,
    "GET",
    `/repos/${owner}/${repo}/contents/${path}${params}`
  );
}

// =============================================================================
// Issues
// =============================================================================

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  html_url: string;
  body?: string;
  user: {
    login: string;
  };
  labels: Array<{
    name: string;
    color: string;
  }>;
  assignees: Array<{
    login: string;
  }>;
  created_at: string;
  updated_at: string;
  closed_at?: string;
}

export async function listIssues(
  userId: string,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open",
  perPage = 30,
  page = 1
): Promise<GitHubIssue[]> {
  return githubRequest<GitHubIssue[]>(
    userId,
    "GET",
    `/repos/${owner}/${repo}/issues?state=${state}&per_page=${perPage}&page=${page}`
  );
}

export async function getIssue(
  userId: string,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<GitHubIssue> {
  return githubRequest<GitHubIssue>(
    userId,
    "GET",
    `/repos/${owner}/${repo}/issues/${issueNumber}`
  );
}

export interface CreateIssueParams {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

export async function createIssue(userId: string, params: CreateIssueParams): Promise<GitHubIssue> {
  const { owner, repo, ...body } = params;
  return githubRequest<GitHubIssue>(
    userId,
    "POST",
    `/repos/${owner}/${repo}/issues`,
    body
  );
}

export interface UpdateIssueParams {
  owner: string;
  repo: string;
  issueNumber: number;
  title?: string;
  body?: string;
  state?: "open" | "closed";
  labels?: string[];
  assignees?: string[];
}

export async function updateIssue(userId: string, params: UpdateIssueParams): Promise<GitHubIssue> {
  const { owner, repo, issueNumber, ...body } = params;
  return githubRequest<GitHubIssue>(
    userId,
    "PATCH",
    `/repos/${owner}/${repo}/issues/${issueNumber}`,
    body
  );
}

export interface GitHubComment {
  id: number;
  html_url: string;
  body: string;
  user: {
    login: string;
  };
  created_at: string;
  updated_at: string;
}

export async function addIssueComment(
  userId: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<GitHubComment> {
  return githubRequest<GitHubComment>(
    userId,
    "POST",
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    { body }
  );
}

// =============================================================================
// Pull Requests
// =============================================================================

export interface GitHubPR {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  html_url: string;
  body?: string;
  user: {
    login: string;
  };
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
  merged: boolean;
  mergeable?: boolean;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  merged_at?: string;
}

export async function listPRs(
  userId: string,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open",
  perPage = 30,
  page = 1
): Promise<GitHubPR[]> {
  return githubRequest<GitHubPR[]>(
    userId,
    "GET",
    `/repos/${owner}/${repo}/pulls?state=${state}&per_page=${perPage}&page=${page}`
  );
}

export async function getPR(
  userId: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<GitHubPR> {
  return githubRequest<GitHubPR>(
    userId,
    "GET",
    `/repos/${owner}/${repo}/pulls/${prNumber}`
  );
}

export interface CreatePRParams {
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
}

export async function createPR(userId: string, params: CreatePRParams): Promise<GitHubPR> {
  const { owner, repo, ...body } = params;
  return githubRequest<GitHubPR>(
    userId,
    "POST",
    `/repos/${owner}/${repo}/pulls`,
    body
  );
}

export async function listPRCommits(
  userId: string,
  owner: string,
  repo: string,
  prNumber: number,
  perPage = 30
): Promise<GitHubCommit[]> {
  return githubRequest<GitHubCommit[]>(
    userId,
    "GET",
    `/repos/${owner}/${repo}/pulls/${prNumber}/commits?per_page=${perPage}`
  );
}

export interface GitHubPRFile {
  sha: string;
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export async function listPRFiles(
  userId: string,
  owner: string,
  repo: string,
  prNumber: number,
  perPage = 30
): Promise<GitHubPRFile[]> {
  return githubRequest<GitHubPRFile[]>(
    userId,
    "GET",
    `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=${perPage}`
  );
}

export interface GitHubPRReview {
  id: number;
  user: {
    login: string;
  };
  body?: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";
  html_url: string;
  submitted_at: string;
}

export async function listPRReviews(
  userId: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<GitHubPRReview[]> {
  return githubRequest<GitHubPRReview[]>(
    userId,
    "GET",
    `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`
  );
}

// =============================================================================
// Search
// =============================================================================

export interface SearchReposResult {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepo[];
}

export async function searchRepos(
  userId: string,
  query: string,
  sort?: "stars" | "forks" | "help-wanted-issues" | "updated",
  perPage = 30,
  page = 1
): Promise<SearchReposResult> {
  const params = new URLSearchParams({
    q: query,
    per_page: perPage.toString(),
    page: page.toString(),
  });
  if (sort) params.set("sort", sort);
  return githubRequest<SearchReposResult>(userId, "GET", `/search/repositories?${params}`);
}

export interface SearchCodeResult {
  total_count: number;
  incomplete_results: boolean;
  items: Array<{
    name: string;
    path: string;
    sha: string;
    html_url: string;
    repository: {
      full_name: string;
    };
  }>;
}

export async function searchCode(
  userId: string,
  query: string,
  perPage = 30,
  page = 1
): Promise<SearchCodeResult> {
  const params = new URLSearchParams({
    q: query,
    per_page: perPage.toString(),
    page: page.toString(),
  });
  return githubRequest<SearchCodeResult>(userId, "GET", `/search/code?${params}`);
}

export interface SearchIssuesResult {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubIssue[];
}

export async function searchIssues(
  userId: string,
  query: string,
  sort?: "comments" | "reactions" | "created" | "updated",
  perPage = 30,
  page = 1
): Promise<SearchIssuesResult> {
  const params = new URLSearchParams({
    q: query,
    per_page: perPage.toString(),
    page: page.toString(),
  });
  if (sort) params.set("sort", sort);
  return githubRequest<SearchIssuesResult>(userId, "GET", `/search/issues?${params}`);
}

// =============================================================================
// Actions
// =============================================================================

export interface GitHubWorkflow {
  id: number;
  name: string;
  path: string;
  state: "active" | "disabled_fork" | "disabled_inactivity" | "disabled_manually";
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface ListWorkflowsResult {
  total_count: number;
  workflows: GitHubWorkflow[];
}

export async function listWorkflows(
  userId: string,
  owner: string,
  repo: string,
  perPage = 30
): Promise<ListWorkflowsResult> {
  return githubRequest<ListWorkflowsResult>(
    userId,
    "GET",
    `/repos/${owner}/${repo}/actions/workflows?per_page=${perPage}`
  );
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  status: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "cancelled" | "skipped" | "timed_out";
  html_url: string;
  created_at: string;
  updated_at: string;
  run_started_at?: string;
  workflow_id: number;
}

export interface ListWorkflowRunsResult {
  total_count: number;
  workflow_runs: GitHubWorkflowRun[];
}

export async function listWorkflowRuns(
  userId: string,
  owner: string,
  repo: string,
  workflowId?: number | string,
  status?: "queued" | "in_progress" | "completed",
  perPage = 30
): Promise<ListWorkflowRunsResult> {
  const params = new URLSearchParams({
    per_page: perPage.toString(),
  });
  if (status) params.set("status", status);

  const endpoint = workflowId
    ? `/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?${params}`
    : `/repos/${owner}/${repo}/actions/runs?${params}`;
  return githubRequest<ListWorkflowRunsResult>(userId, "GET", endpoint);
}

export async function getWorkflowRun(
  userId: string,
  owner: string,
  repo: string,
  runId: number
): Promise<GitHubWorkflowRun> {
  return githubRequest<GitHubWorkflowRun>(
    userId,
    "GET",
    `/repos/${owner}/${repo}/actions/runs/${runId}`
  );
}
