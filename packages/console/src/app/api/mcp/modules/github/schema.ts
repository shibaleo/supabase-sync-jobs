// packages/console/src/app/api/mcp/modules/github/schema.ts

import {
  ModuleDefinition,
  ToolDefinition,
  ToolHandler,
  McpToolResult,
} from "../../lib/types";
import * as api from "./client";

function formatResult(data: unknown): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function formatError(error: unknown): McpToolResult {
  const message = error instanceof Error ? error.message : "Unknown error";
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

const tools: ToolDefinition[] = [
  // User
  {
    name: "github_get_user",
    description: "Get information about the authenticated GitHub user.",
    inputSchema: { type: "object", properties: {} },
  },
  // Repositories
  {
    name: "github_list_repos",
    description: "List repositories for the authenticated user.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["all", "owner", "public", "private"], description: "Type of repositories. Default: owner" },
        sort: { type: "string", enum: ["created", "updated", "pushed", "full_name"], description: "Sort by. Default: updated" },
        perPage: { type: "number", description: "Results per page. Default: 30" },
        page: { type: "number", description: "Page number. Default: 1" },
      },
    },
  },
  {
    name: "github_get_repo",
    description: "Get details of a specific repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner. Required." },
        repo: { type: "string", description: "Repository name. Required." },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "github_list_branches",
    description: "List branches in a repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner. Required." },
        repo: { type: "string", description: "Repository name. Required." },
        perPage: { type: "number", description: "Results per page. Default: 30" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "github_list_commits",
    description: "List commits in a repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner. Required." },
        repo: { type: "string", description: "Repository name. Required." },
        sha: { type: "string", description: "Branch name or commit SHA to filter by." },
        perPage: { type: "number", description: "Results per page. Default: 30" },
        page: { type: "number", description: "Page number. Default: 1" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "github_get_file_content",
    description: "Get the content of a file in a repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner. Required." },
        repo: { type: "string", description: "Repository name. Required." },
        path: { type: "string", description: "File path. Required." },
        ref: { type: "string", description: "Branch name or commit SHA." },
      },
      required: ["owner", "repo", "path"],
    },
  },
  // Issues
  {
    name: "github_list_issues",
    description: "List issues in a repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner. Required." },
        repo: { type: "string", description: "Repository name. Required." },
        state: { type: "string", enum: ["open", "closed", "all"], description: "Issue state. Default: open" },
        perPage: { type: "number", description: "Results per page. Default: 30" },
        page: { type: "number", description: "Page number. Default: 1" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "github_get_issue",
    description: "Get details of a specific issue.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner. Required." },
        repo: { type: "string", description: "Repository name. Required." },
        issueNumber: { type: "number", description: "Issue number. Required." },
      },
      required: ["owner", "repo", "issueNumber"],
    },
  },
  {
    name: "github_create_issue",
    description: "Create a new issue in a repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner. Required." },
        repo: { type: "string", description: "Repository name. Required." },
        title: { type: "string", description: "Issue title. Required." },
        body: { type: "string", description: "Issue body." },
        labels: { type: "array", items: { type: "string" }, description: "Labels to assign." },
        assignees: { type: "array", items: { type: "string" }, description: "Users to assign." },
      },
      required: ["owner", "repo", "title"],
    },
  },
  {
    name: "github_update_issue",
    description: "Update an existing issue.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner. Required." },
        repo: { type: "string", description: "Repository name. Required." },
        issueNumber: { type: "number", description: "Issue number. Required." },
        title: { type: "string", description: "New title." },
        body: { type: "string", description: "New body." },
        state: { type: "string", enum: ["open", "closed"], description: "New state." },
        labels: { type: "array", items: { type: "string" }, description: "Labels to set." },
        assignees: { type: "array", items: { type: "string" }, description: "Users to assign." },
      },
      required: ["owner", "repo", "issueNumber"],
    },
  },
  {
    name: "github_add_issue_comment",
    description: "Add a comment to an issue.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner. Required." },
        repo: { type: "string", description: "Repository name. Required." },
        issueNumber: { type: "number", description: "Issue number. Required." },
        body: { type: "string", description: "Comment body. Required." },
      },
      required: ["owner", "repo", "issueNumber", "body"],
    },
  },
  // Pull Requests
  {
    name: "github_list_prs",
    description: "List pull requests in a repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner. Required." },
        repo: { type: "string", description: "Repository name. Required." },
        state: { type: "string", enum: ["open", "closed", "all"], description: "PR state. Default: open" },
        perPage: { type: "number", description: "Results per page. Default: 30" },
        page: { type: "number", description: "Page number. Default: 1" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "github_get_pr",
    description: "Get details of a specific pull request.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner. Required." },
        repo: { type: "string", description: "Repository name. Required." },
        prNumber: { type: "number", description: "PR number. Required." },
      },
      required: ["owner", "repo", "prNumber"],
    },
  },
  {
    name: "github_create_pr",
    description: "Create a new pull request.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner. Required." },
        repo: { type: "string", description: "Repository name. Required." },
        title: { type: "string", description: "PR title. Required." },
        head: { type: "string", description: "Branch with changes. Required." },
        base: { type: "string", description: "Branch to merge into. Required." },
        body: { type: "string", description: "PR description." },
        draft: { type: "boolean", description: "Create as draft PR." },
      },
      required: ["owner", "repo", "title", "head", "base"],
    },
  },
  {
    name: "github_list_pr_commits",
    description: "List commits in a pull request.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner. Required." },
        repo: { type: "string", description: "Repository name. Required." },
        prNumber: { type: "number", description: "PR number. Required." },
        perPage: { type: "number", description: "Results per page. Default: 30" },
      },
      required: ["owner", "repo", "prNumber"],
    },
  },
  {
    name: "github_list_pr_files",
    description: "List files changed in a pull request.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner. Required." },
        repo: { type: "string", description: "Repository name. Required." },
        prNumber: { type: "number", description: "PR number. Required." },
        perPage: { type: "number", description: "Results per page. Default: 30" },
      },
      required: ["owner", "repo", "prNumber"],
    },
  },
  {
    name: "github_list_pr_reviews",
    description: "List reviews on a pull request.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner. Required." },
        repo: { type: "string", description: "Repository name. Required." },
        prNumber: { type: "number", description: "PR number. Required." },
      },
      required: ["owner", "repo", "prNumber"],
    },
  },
  // Search
  {
    name: "github_search_repos",
    description: "Search for repositories.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query. Required." },
        sort: { type: "string", enum: ["stars", "forks", "help-wanted-issues", "updated"], description: "Sort by." },
        perPage: { type: "number", description: "Results per page. Default: 30" },
        page: { type: "number", description: "Page number. Default: 1" },
      },
      required: ["query"],
    },
  },
  {
    name: "github_search_code",
    description: "Search for code across repositories.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (e.g., 'addClass in:file language:js repo:jquery/jquery'). Required." },
        perPage: { type: "number", description: "Results per page. Default: 30" },
        page: { type: "number", description: "Page number. Default: 1" },
      },
      required: ["query"],
    },
  },
  {
    name: "github_search_issues",
    description: "Search for issues and pull requests.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (e.g., 'repo:owner/repo is:open is:issue'). Required." },
        sort: { type: "string", enum: ["comments", "reactions", "created", "updated"], description: "Sort by." },
        perPage: { type: "number", description: "Results per page. Default: 30" },
        page: { type: "number", description: "Page number. Default: 1" },
      },
      required: ["query"],
    },
  },
  // Actions
  {
    name: "github_list_workflows",
    description: "List workflows in a repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner. Required." },
        repo: { type: "string", description: "Repository name. Required." },
        perPage: { type: "number", description: "Results per page. Default: 30" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "github_list_workflow_runs",
    description: "List workflow runs in a repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner. Required." },
        repo: { type: "string", description: "Repository name. Required." },
        workflowId: { type: ["number", "string"], description: "Workflow ID or file name to filter by." },
        status: { type: "string", enum: ["queued", "in_progress", "completed"], description: "Filter by status." },
        perPage: { type: "number", description: "Results per page. Default: 30" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "github_get_workflow_run",
    description: "Get details of a specific workflow run.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner. Required." },
        repo: { type: "string", description: "Repository name. Required." },
        runId: { type: "number", description: "Workflow run ID. Required." },
      },
      required: ["owner", "repo", "runId"],
    },
  },
];

// Handlers - all receive userId as second parameter
async function getUser(_params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const user = await api.getUser(userId);
    return formatResult({
      login: user.login,
      name: user.name,
      email: user.email,
      html_url: user.html_url,
      public_repos: user.public_repos,
      followers: user.followers,
      following: user.following,
    });
  } catch (error) {
    return formatError(error);
  }
}

async function listRepos(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const repos = await api.listRepos(
      userId,
      params.type as "all" | "owner" | "public" | "private" | undefined,
      params.sort as "created" | "updated" | "pushed" | "full_name" | undefined,
      params.perPage as number | undefined,
      params.page as number | undefined
    );
    return formatResult(
      repos.map((r) => ({
        full_name: r.full_name,
        private: r.private,
        description: r.description,
        language: r.language,
        stargazers_count: r.stargazers_count,
        updated_at: r.updated_at,
        html_url: r.html_url,
      }))
    );
  } catch (error) {
    return formatError(error);
  }
}

async function getRepo(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const repo = await api.getRepo(userId, params.owner as string, params.repo as string);
    return formatResult(repo);
  } catch (error) {
    return formatError(error);
  }
}

async function listBranches(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const branches = await api.listBranches(
      userId,
      params.owner as string,
      params.repo as string,
      params.perPage as number | undefined
    );
    return formatResult(
      branches.map((b) => ({
        name: b.name,
        sha: b.commit.sha.substring(0, 7),
        protected: b.protected,
      }))
    );
  } catch (error) {
    return formatError(error);
  }
}

async function listCommits(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const commits = await api.listCommits(
      userId,
      params.owner as string,
      params.repo as string,
      params.sha as string | undefined,
      params.perPage as number | undefined,
      params.page as number | undefined
    );
    return formatResult(
      commits.map((c) => ({
        sha: c.sha.substring(0, 7),
        message: c.commit.message.split("\n")[0],
        author: c.commit.author.name,
        date: c.commit.author.date,
      }))
    );
  } catch (error) {
    return formatError(error);
  }
}

async function getFileContent(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const content = await api.getFileContent(
      userId,
      params.owner as string,
      params.repo as string,
      params.path as string,
      params.ref as string | undefined
    );
    let decodedContent = "";
    if (content.content && content.encoding === "base64") {
      decodedContent = Buffer.from(content.content.replace(/\n/g, ""), "base64").toString("utf-8");
    }
    return formatResult({
      name: content.name,
      path: content.path,
      sha: content.sha.substring(0, 7),
      size: content.size,
      html_url: content.html_url,
      content: decodedContent,
    });
  } catch (error) {
    return formatError(error);
  }
}

async function listIssues(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const issues = await api.listIssues(
      userId,
      params.owner as string,
      params.repo as string,
      params.state as "open" | "closed" | "all" | undefined,
      params.perPage as number | undefined,
      params.page as number | undefined
    );
    return formatResult(
      issues.map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        user: i.user.login,
        labels: i.labels.map((l) => l.name),
        created_at: i.created_at,
        html_url: i.html_url,
      }))
    );
  } catch (error) {
    return formatError(error);
  }
}

async function getIssue(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const issue = await api.getIssue(
      userId,
      params.owner as string,
      params.repo as string,
      params.issueNumber as number
    );
    return formatResult(issue);
  } catch (error) {
    return formatError(error);
  }
}

async function createIssue(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const issue = await api.createIssue(userId, {
      owner: params.owner as string,
      repo: params.repo as string,
      title: params.title as string,
      body: params.body as string | undefined,
      labels: params.labels as string[] | undefined,
      assignees: params.assignees as string[] | undefined,
    });
    return formatResult({
      number: issue.number,
      title: issue.title,
      html_url: issue.html_url,
      created_at: issue.created_at,
    });
  } catch (error) {
    return formatError(error);
  }
}

async function updateIssue(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const issue = await api.updateIssue(userId, {
      owner: params.owner as string,
      repo: params.repo as string,
      issueNumber: params.issueNumber as number,
      title: params.title as string | undefined,
      body: params.body as string | undefined,
      state: params.state as "open" | "closed" | undefined,
      labels: params.labels as string[] | undefined,
      assignees: params.assignees as string[] | undefined,
    });
    return formatResult({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      html_url: issue.html_url,
      updated_at: issue.updated_at,
    });
  } catch (error) {
    return formatError(error);
  }
}

async function addIssueComment(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const comment = await api.addIssueComment(
      userId,
      params.owner as string,
      params.repo as string,
      params.issueNumber as number,
      params.body as string
    );
    return formatResult({
      id: comment.id,
      html_url: comment.html_url,
      created_at: comment.created_at,
    });
  } catch (error) {
    return formatError(error);
  }
}

async function listPRs(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const prs = await api.listPRs(
      userId,
      params.owner as string,
      params.repo as string,
      params.state as "open" | "closed" | "all" | undefined,
      params.perPage as number | undefined,
      params.page as number | undefined
    );
    return formatResult(
      prs.map((p) => ({
        number: p.number,
        title: p.title,
        state: p.state,
        user: p.user.login,
        head: p.head.ref,
        base: p.base.ref,
        merged: p.merged,
        created_at: p.created_at,
        html_url: p.html_url,
      }))
    );
  } catch (error) {
    return formatError(error);
  }
}

async function getPR(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const pr = await api.getPR(
      userId,
      params.owner as string,
      params.repo as string,
      params.prNumber as number
    );
    return formatResult(pr);
  } catch (error) {
    return formatError(error);
  }
}

async function createPR(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const pr = await api.createPR(userId, {
      owner: params.owner as string,
      repo: params.repo as string,
      title: params.title as string,
      head: params.head as string,
      base: params.base as string,
      body: params.body as string | undefined,
      draft: params.draft as boolean | undefined,
    });
    return formatResult({
      number: pr.number,
      title: pr.title,
      html_url: pr.html_url,
      created_at: pr.created_at,
    });
  } catch (error) {
    return formatError(error);
  }
}

async function listPRCommits(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const commits = await api.listPRCommits(
      userId,
      params.owner as string,
      params.repo as string,
      params.prNumber as number,
      params.perPage as number | undefined
    );
    return formatResult(
      commits.map((c) => ({
        sha: c.sha.substring(0, 7),
        message: c.commit.message.split("\n")[0],
        author: c.commit.author.name,
        date: c.commit.author.date,
      }))
    );
  } catch (error) {
    return formatError(error);
  }
}

async function listPRFiles(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const files = await api.listPRFiles(
      userId,
      params.owner as string,
      params.repo as string,
      params.prNumber as number,
      params.perPage as number | undefined
    );
    return formatResult(
      files.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
      }))
    );
  } catch (error) {
    return formatError(error);
  }
}

async function listPRReviews(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const reviews = await api.listPRReviews(
      userId,
      params.owner as string,
      params.repo as string,
      params.prNumber as number
    );
    return formatResult(
      reviews.map((r) => ({
        id: r.id,
        user: r.user.login,
        state: r.state,
        submitted_at: r.submitted_at,
      }))
    );
  } catch (error) {
    return formatError(error);
  }
}

async function searchRepos(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const result = await api.searchRepos(
      userId,
      params.query as string,
      params.sort as "stars" | "forks" | "help-wanted-issues" | "updated" | undefined,
      params.perPage as number | undefined,
      params.page as number | undefined
    );
    return formatResult({
      total_count: result.total_count,
      items: result.items.map((r) => ({
        full_name: r.full_name,
        description: r.description,
        stargazers_count: r.stargazers_count,
        language: r.language,
        html_url: r.html_url,
      })),
    });
  } catch (error) {
    return formatError(error);
  }
}

async function searchCode(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const result = await api.searchCode(
      userId,
      params.query as string,
      params.perPage as number | undefined,
      params.page as number | undefined
    );
    return formatResult({
      total_count: result.total_count,
      items: result.items.map((i) => ({
        name: i.name,
        path: i.path,
        repository: i.repository.full_name,
        html_url: i.html_url,
      })),
    });
  } catch (error) {
    return formatError(error);
  }
}

async function searchIssues(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const result = await api.searchIssues(
      userId,
      params.query as string,
      params.sort as "comments" | "reactions" | "created" | "updated" | undefined,
      params.perPage as number | undefined,
      params.page as number | undefined
    );
    return formatResult({
      total_count: result.total_count,
      items: result.items.map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        user: i.user.login,
        created_at: i.created_at,
        html_url: i.html_url,
      })),
    });
  } catch (error) {
    return formatError(error);
  }
}

async function listWorkflows(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const result = await api.listWorkflows(
      userId,
      params.owner as string,
      params.repo as string,
      params.perPage as number | undefined
    );
    return formatResult({
      total_count: result.total_count,
      workflows: result.workflows.map((w) => ({
        id: w.id,
        name: w.name,
        path: w.path,
        state: w.state,
      })),
    });
  } catch (error) {
    return formatError(error);
  }
}

async function listWorkflowRuns(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const result = await api.listWorkflowRuns(
      userId,
      params.owner as string,
      params.repo as string,
      params.workflowId as number | string | undefined,
      params.status as "queued" | "in_progress" | "completed" | undefined,
      params.perPage as number | undefined
    );
    return formatResult({
      total_count: result.total_count,
      workflow_runs: result.workflow_runs.map((r) => ({
        id: r.id,
        name: r.name,
        head_branch: r.head_branch,
        status: r.status,
        conclusion: r.conclusion,
        created_at: r.created_at,
        html_url: r.html_url,
      })),
    });
  } catch (error) {
    return formatError(error);
  }
}

async function getWorkflowRun(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const run = await api.getWorkflowRun(
      userId,
      params.owner as string,
      params.repo as string,
      params.runId as number
    );
    return formatResult(run);
  } catch (error) {
    return formatError(error);
  }
}

const handlers: Record<string, ToolHandler> = {
  github_get_user: getUser,
  github_list_repos: listRepos,
  github_get_repo: getRepo,
  github_list_branches: listBranches,
  github_list_commits: listCommits,
  github_get_file_content: getFileContent,
  github_list_issues: listIssues,
  github_get_issue: getIssue,
  github_create_issue: createIssue,
  github_update_issue: updateIssue,
  github_add_issue_comment: addIssueComment,
  github_list_prs: listPRs,
  github_get_pr: getPR,
  github_create_pr: createPR,
  github_list_pr_commits: listPRCommits,
  github_list_pr_files: listPRFiles,
  github_list_pr_reviews: listPRReviews,
  github_search_repos: searchRepos,
  github_search_code: searchCode,
  github_search_issues: searchIssues,
  github_list_workflows: listWorkflows,
  github_list_workflow_runs: listWorkflowRuns,
  github_get_workflow_run: getWorkflowRun,
};

export const githubModule: ModuleDefinition = {
  name: "github",
  description: "GitHub API 操作（リポジトリ、Issue、PR、Actions、検索）",
  tools,
  handlers,
};
