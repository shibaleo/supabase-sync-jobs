// packages/console/src/app/api/mcp/modules/jira/schema.ts

import {
  ModuleDefinition,
  ToolDefinition,
  ToolHandler,
  McpToolResult,
} from "../../lib/types";
import * as api from "./client";
import type { AtlassianApiError } from "./client";

function formatResult(data: unknown): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function formatError(error: unknown): McpToolResult {
  const e = error as AtlassianApiError;
  const message =
    e?.errorMessages?.join(", ") ||
    (error instanceof Error ? error.message : "Unknown error");
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

const tools: ToolDefinition[] = [
  {
    name: "jira_get_myself",
    description: "Get information about the current Jira user (myself).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "jira_list_projects",
    description: "List all Jira projects accessible to the current user.",
    inputSchema: {
      type: "object",
      properties: {
        startAt: { type: "number", description: "Starting index for pagination. Default: 0" },
        maxResults: { type: "number", description: "Maximum results to return. Default: 50" },
      },
    },
  },
  {
    name: "jira_get_project",
    description: "Get details of a specific Jira project.",
    inputSchema: {
      type: "object",
      properties: {
        projectKey: { type: "string", description: "Project key (e.g., 'PROJ') or ID. Required." },
      },
      required: ["projectKey"],
    },
  },
  {
    name: "jira_search",
    description: "Search for Jira issues using JQL (Jira Query Language). Example JQL: 'project = PROJ AND status = \"In Progress\"'",
    inputSchema: {
      type: "object",
      properties: {
        jql: { type: "string", description: "JQL query string. Example: 'project = PROJ AND status != Done ORDER BY created DESC'" },
        startAt: { type: "number", description: "Starting index for pagination. Default: 0" },
        maxResults: { type: "number", description: "Maximum results to return. Default: 50" },
        fields: { type: "array", items: { type: "string" }, description: "Fields to return. Default: summary, status, priority, assignee, created, updated" },
      },
      required: ["jql"],
    },
  },
  {
    name: "jira_get_issue",
    description: "Get details of a specific Jira issue by key or ID.",
    inputSchema: {
      type: "object",
      properties: {
        issueKey: { type: "string", description: "Issue key (e.g., 'PROJ-123') or ID. Required." },
        fields: { type: "array", items: { type: "string" }, description: "Specific fields to return. If not specified, returns common fields." },
      },
      required: ["issueKey"],
    },
  },
  {
    name: "jira_create_issue",
    description: "Create a new Jira issue.",
    inputSchema: {
      type: "object",
      properties: {
        projectKey: { type: "string", description: "Project key (e.g., 'PROJ'). Required." },
        issueType: { type: "string", description: "Issue type (e.g., 'Task', 'Bug', 'Story', 'Epic'). Required." },
        summary: { type: "string", description: "Issue summary/title. Required." },
        description: { type: "string", description: "Issue description." },
        assigneeAccountId: { type: "string", description: "Assignee's Atlassian account ID." },
        priority: { type: "string", description: "Priority name (e.g., 'High', 'Medium', 'Low')." },
        labels: { type: "array", items: { type: "string" }, description: "Labels to add to the issue." },
        parentKey: { type: "string", description: "Parent issue key for subtasks." },
      },
      required: ["projectKey", "issueType", "summary"],
    },
  },
  {
    name: "jira_update_issue",
    description: "Update an existing Jira issue.",
    inputSchema: {
      type: "object",
      properties: {
        issueKey: { type: "string", description: "Issue key (e.g., 'PROJ-123'). Required." },
        summary: { type: "string", description: "New summary/title." },
        description: { type: "string", description: "New description." },
        assigneeAccountId: { type: "string", description: "New assignee's Atlassian account ID." },
        priority: { type: "string", description: "New priority name." },
        labels: { type: "array", items: { type: "string" }, description: "New labels (replaces existing)." },
      },
      required: ["issueKey"],
    },
  },
  {
    name: "jira_get_transitions",
    description: "Get available transitions for an issue. Use this to find valid transition IDs before changing issue status.",
    inputSchema: {
      type: "object",
      properties: {
        issueKey: { type: "string", description: "Issue key (e.g., 'PROJ-123'). Required." },
      },
      required: ["issueKey"],
    },
  },
  {
    name: "jira_transition_issue",
    description: "Transition an issue to a new status. Use jira_get_transitions first to get valid transition IDs.",
    inputSchema: {
      type: "object",
      properties: {
        issueKey: { type: "string", description: "Issue key (e.g., 'PROJ-123'). Required." },
        transitionId: { type: "string", description: "Transition ID (get from jira_get_transitions). Required." },
        comment: { type: "string", description: "Optional comment to add with the transition." },
      },
      required: ["issueKey", "transitionId"],
    },
  },
  {
    name: "jira_get_comments",
    description: "Get comments on a Jira issue.",
    inputSchema: {
      type: "object",
      properties: {
        issueKey: { type: "string", description: "Issue key (e.g., 'PROJ-123'). Required." },
        startAt: { type: "number", description: "Starting index for pagination. Default: 0" },
        maxResults: { type: "number", description: "Maximum results to return. Default: 50" },
      },
      required: ["issueKey"],
    },
  },
  {
    name: "jira_add_comment",
    description: "Add a comment to a Jira issue.",
    inputSchema: {
      type: "object",
      properties: {
        issueKey: { type: "string", description: "Issue key (e.g., 'PROJ-123'). Required." },
        body: { type: "string", description: "Comment text. Required." },
      },
      required: ["issueKey", "body"],
    },
  },
  {
    name: "jira_get_worklogs",
    description: "Get work logs for a Jira issue.",
    inputSchema: {
      type: "object",
      properties: {
        issueKey: { type: "string", description: "Issue key (e.g., 'PROJ-123'). Required." },
        startAt: { type: "number", description: "Starting index for pagination. Default: 0" },
        maxResults: { type: "number", description: "Maximum results to return. Default: 50" },
      },
      required: ["issueKey"],
    },
  },
  {
    name: "jira_add_worklog",
    description: "Add a work log to a Jira issue.",
    inputSchema: {
      type: "object",
      properties: {
        issueKey: { type: "string", description: "Issue key (e.g., 'PROJ-123'). Required." },
        timeSpentSeconds: { type: "number", description: "Time spent in seconds. Required." },
        started: { type: "string", description: "Start time in ISO 8601 format (e.g., '2024-01-15T10:00:00.000+0900'). Defaults to now." },
        comment: { type: "string", description: "Work log comment." },
      },
      required: ["issueKey", "timeSpentSeconds"],
    },
  },
];

// Handlers - all receive userId as second parameter
async function getMyself(_params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    return formatResult(await api.jiraGetMyself(userId));
  } catch (error) {
    return formatError(error);
  }
}

async function listProjects(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const { startAt = 0, maxResults = 50 } = params as { startAt?: number; maxResults?: number };
    const res = await api.jiraListProjects(userId, startAt, maxResults);
    return formatResult({
      total: res.total,
      projects: res.values.map((p) => ({ key: p.key, name: p.name, type: p.projectTypeKey })),
    });
  } catch (error) {
    return formatError(error);
  }
}

async function getProject(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    return formatResult(await api.jiraGetProject(userId, (params as { projectKey: string }).projectKey));
  } catch (error) {
    return formatError(error);
  }
}

async function search(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const { jql, startAt = 0, maxResults = 50, fields = ["summary", "status", "priority", "assignee", "created", "updated"] } = params as {
      jql: string;
      startAt?: number;
      maxResults?: number;
      fields?: string[];
    };
    const res = await api.jiraSearch(userId, jql, startAt, maxResults, fields);
    return formatResult({
      total: res.total,
      issues: res.issues.map((i) => ({
        key: i.key,
        summary: i.fields.summary,
        status: i.fields.status?.name,
        priority: i.fields.priority?.name,
        assignee: i.fields.assignee?.displayName,
        created: i.fields.created,
        updated: i.fields.updated,
      })),
    });
  } catch (error) {
    return formatError(error);
  }
}

async function getIssue(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const { issueKey, fields } = params as { issueKey: string; fields?: string[] };
    const i = await api.jiraGetIssue(userId, issueKey, fields);
    return formatResult({
      key: i.key,
      id: i.id,
      summary: i.fields.summary,
      description: i.fields.description,
      status: i.fields.status?.name,
      priority: i.fields.priority?.name,
      type: i.fields.issuetype?.name,
      assignee: i.fields.assignee?.displayName,
      reporter: i.fields.reporter?.displayName,
      labels: i.fields.labels,
      project: i.fields.project?.key,
      parent: i.fields.parent?.key,
      created: i.fields.created,
      updated: i.fields.updated,
    });
  } catch (error) {
    return formatError(error);
  }
}

async function createIssue(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const issue = await api.jiraCreateIssue(userId, params as api.JiraCreateIssueParams);
    return formatResult({ created: true, key: issue.key, id: issue.id, self: issue.self });
  } catch (error) {
    return formatError(error);
  }
}

async function updateIssue(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const { issueKey, ...rest } = params as {
      issueKey: string;
      summary?: string;
      description?: string;
      assigneeAccountId?: string;
      priority?: string;
      labels?: string[];
    };
    await api.jiraUpdateIssue(userId, { issueKeyOrId: issueKey, ...rest });
    return formatResult({ updated: true, issueKey });
  } catch (error) {
    return formatError(error);
  }
}

async function getTransitions(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const { issueKey } = params as { issueKey: string };
    const res = await api.jiraGetTransitions(userId, issueKey);
    return formatResult({
      issueKey,
      transitions: res.transitions.map((t) => ({ id: t.id, name: t.name, to: t.to.name })),
    });
  } catch (error) {
    return formatError(error);
  }
}

async function transitionIssue(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const { issueKey, transitionId, comment } = params as {
      issueKey: string;
      transitionId: string;
      comment?: string;
    };
    await api.jiraTransitionIssue(userId, issueKey, transitionId, comment);
    return formatResult({ transitioned: true, issueKey, transitionId });
  } catch (error) {
    return formatError(error);
  }
}

async function getComments(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const { issueKey, startAt = 0, maxResults = 50 } = params as {
      issueKey: string;
      startAt?: number;
      maxResults?: number;
    };
    const res = await api.jiraGetComments(userId, issueKey, startAt, maxResults);
    return formatResult({
      issueKey,
      total: res.total,
      comments: res.comments.map((c) => ({
        id: c.id,
        author: c.author.displayName,
        created: c.created,
        updated: c.updated,
        body: c.body,
      })),
    });
  } catch (error) {
    return formatError(error);
  }
}

async function addComment(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const { issueKey, body } = params as { issueKey: string; body: string };
    const c = await api.jiraAddComment(userId, issueKey, body);
    return formatResult({ added: true, issueKey, commentId: c.id, created: c.created });
  } catch (error) {
    return formatError(error);
  }
}

async function getWorklogs(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const { issueKey, startAt = 0, maxResults = 50 } = params as {
      issueKey: string;
      startAt?: number;
      maxResults?: number;
    };
    const res = await api.jiraGetWorklogs(userId, issueKey, startAt, maxResults);
    return formatResult({
      issueKey,
      total: res.total,
      worklogs: res.worklogs.map((w) => ({
        id: w.id,
        author: w.author.displayName,
        started: w.started,
        timeSpent: w.timeSpent,
        timeSpentSeconds: w.timeSpentSeconds,
        comment: w.comment,
      })),
    });
  } catch (error) {
    return formatError(error);
  }
}

async function addWorklog(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const { issueKey, timeSpentSeconds, started, comment } = params as {
      issueKey: string;
      timeSpentSeconds: number;
      started?: string;
      comment?: string;
    };
    const w = await api.jiraAddWorklog(userId, { issueKeyOrId: issueKey, timeSpentSeconds, started, comment });
    return formatResult({ added: true, issueKey, worklogId: w.id, timeSpent: w.timeSpent, started: w.started });
  } catch (error) {
    return formatError(error);
  }
}

const handlers: Record<string, ToolHandler> = {
  jira_get_myself: getMyself,
  jira_list_projects: listProjects,
  jira_get_project: getProject,
  jira_search: search,
  jira_get_issue: getIssue,
  jira_create_issue: createIssue,
  jira_update_issue: updateIssue,
  jira_get_transitions: getTransitions,
  jira_transition_issue: transitionIssue,
  jira_get_comments: getComments,
  jira_add_comment: addComment,
  jira_get_worklogs: getWorklogs,
  jira_add_worklog: addWorklog,
};

export const jiraModule: ModuleDefinition = {
  name: "jira",
  description: "Jira Issue/Project 操作（検索、作成、更新、コメント、ワークログ）",
  tools,
  handlers,
};
