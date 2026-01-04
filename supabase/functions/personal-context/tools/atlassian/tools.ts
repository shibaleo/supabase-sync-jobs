// Atlassian MCP Tools (Jira + Confluence)

import { ToolDefinition, McpToolResult } from "../../mcp/types.ts";
import * as api from "./client.ts";
import type { AtlassianApiError } from "./client.ts";

function formatResult(data: unknown): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function formatError(error: unknown): McpToolResult {
  const e = error as AtlassianApiError;
  const message = e?.errorMessages?.join(", ") || (error instanceof Error ? error.message : "Unknown error");
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

export function getAtlassianTools(): ToolDefinition[] {
  return [
    // =========================================================================
    // JIRA TOOLS (13)
    // =========================================================================

    // jira_get_myself
    {
      name: "jira_get_myself",
      description: "Get information about the current Jira user (myself).",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        try {
          return formatResult(await api.jiraGetMyself());
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // jira_list_projects
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
      handler: async (params) => {
        try {
          const { startAt = 0, maxResults = 50 } = params as { startAt?: number; maxResults?: number };
          const res = await api.jiraListProjects(startAt, maxResults);
          return formatResult({ total: res.total, projects: res.values.map((p) => ({ key: p.key, name: p.name, type: p.projectTypeKey })) });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // jira_get_project
    {
      name: "jira_get_project",
      description: "Get details of a specific Jira project.",
      inputSchema: {
        type: "object",
        properties: { projectKey: { type: "string", description: "Project key (e.g., 'PROJ') or ID. Required." } },
        required: ["projectKey"],
      },
      handler: async (params) => {
        try {
          return formatResult(await api.jiraGetProject((params as { projectKey: string }).projectKey));
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // jira_search
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
      handler: async (params) => {
        try {
          const { jql, startAt = 0, maxResults = 50, fields = ["summary", "status", "priority", "assignee", "created", "updated"] } = params as { jql: string; startAt?: number; maxResults?: number; fields?: string[] };
          const res = await api.jiraSearch(jql, startAt, maxResults, fields);
          return formatResult({
            total: res.total,
            issues: res.issues.map((i) => ({ key: i.key, summary: i.fields.summary, status: i.fields.status?.name, priority: i.fields.priority?.name, assignee: i.fields.assignee?.displayName, created: i.fields.created, updated: i.fields.updated })),
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // jira_get_issue
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
      handler: async (params) => {
        try {
          const { issueKey, fields } = params as { issueKey: string; fields?: string[] };
          const i = await api.jiraGetIssue(issueKey, fields);
          return formatResult({
            key: i.key, id: i.id, summary: i.fields.summary, description: i.fields.description, status: i.fields.status?.name,
            priority: i.fields.priority?.name, type: i.fields.issuetype?.name, assignee: i.fields.assignee?.displayName,
            reporter: i.fields.reporter?.displayName, labels: i.fields.labels, project: i.fields.project?.key,
            parent: i.fields.parent?.key, created: i.fields.created, updated: i.fields.updated,
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // jira_create_issue
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
      handler: async (params) => {
        try {
          const issue = await api.jiraCreateIssue(params as api.JiraCreateIssueParams);
          return formatResult({ created: true, key: issue.key, id: issue.id, self: issue.self });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // jira_update_issue
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
      handler: async (params) => {
        try {
          const { issueKey, ...rest } = params as { issueKey: string; summary?: string; description?: string; assigneeAccountId?: string; priority?: string; labels?: string[] };
          await api.jiraUpdateIssue({ issueKeyOrId: issueKey, ...rest });
          return formatResult({ updated: true, issueKey });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // jira_get_transitions
    {
      name: "jira_get_transitions",
      description: "Get available transitions for an issue. Use this to find valid transition IDs before changing issue status.",
      inputSchema: {
        type: "object",
        properties: { issueKey: { type: "string", description: "Issue key (e.g., 'PROJ-123'). Required." } },
        required: ["issueKey"],
      },
      handler: async (params) => {
        try {
          const { issueKey } = params as { issueKey: string };
          const res = await api.jiraGetTransitions(issueKey);
          return formatResult({ issueKey, transitions: res.transitions.map((t) => ({ id: t.id, name: t.name, to: t.to.name })) });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // jira_transition_issue
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
      handler: async (params) => {
        try {
          const { issueKey, transitionId, comment } = params as { issueKey: string; transitionId: string; comment?: string };
          await api.jiraTransitionIssue(issueKey, transitionId, comment);
          return formatResult({ transitioned: true, issueKey, transitionId });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // jira_get_comments
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
      handler: async (params) => {
        try {
          const { issueKey, startAt = 0, maxResults = 50 } = params as { issueKey: string; startAt?: number; maxResults?: number };
          const res = await api.jiraGetComments(issueKey, startAt, maxResults);
          return formatResult({ issueKey, total: res.total, comments: res.comments.map((c) => ({ id: c.id, author: c.author.displayName, created: c.created, updated: c.updated, body: c.body })) });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // jira_add_comment
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
      handler: async (params) => {
        try {
          const { issueKey, body } = params as { issueKey: string; body: string };
          const c = await api.jiraAddComment(issueKey, body);
          return formatResult({ added: true, issueKey, commentId: c.id, created: c.created });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // jira_get_worklogs
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
      handler: async (params) => {
        try {
          const { issueKey, startAt = 0, maxResults = 50 } = params as { issueKey: string; startAt?: number; maxResults?: number };
          const res = await api.jiraGetWorklogs(issueKey, startAt, maxResults);
          return formatResult({
            issueKey, total: res.total,
            worklogs: res.worklogs.map((w) => ({ id: w.id, author: w.author.displayName, started: w.started, timeSpent: w.timeSpent, timeSpentSeconds: w.timeSpentSeconds, comment: w.comment })),
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // jira_add_worklog
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
      handler: async (params) => {
        try {
          const { issueKey, timeSpentSeconds, started, comment } = params as { issueKey: string; timeSpentSeconds: number; started?: string; comment?: string };
          const w = await api.jiraAddWorklog({ issueKeyOrId: issueKey, timeSpentSeconds, started, comment });
          return formatResult({ added: true, issueKey, worklogId: w.id, timeSpent: w.timeSpent, started: w.started });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // =========================================================================
    // CONFLUENCE TOOLS (11)
    // =========================================================================

    // confluence_list_spaces
    {
      name: "confluence_list_spaces",
      description: "List all Confluence spaces accessible to the current user.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Maximum results to return. Default: 25" },
          cursor: { type: "string", description: "Pagination cursor for next page." },
        },
      },
      handler: async (params) => {
        try {
          const { limit = 25, cursor } = params as { limit?: number; cursor?: string };
          const res = await api.confluenceListSpaces(limit, cursor);
          return formatResult({ spaces: res.results.map((s) => ({ id: s.id, key: s.key, name: s.name, type: s.type })), next: res._links?.next });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // confluence_get_space
    {
      name: "confluence_get_space",
      description: "Get details of a specific Confluence space by ID or key.",
      inputSchema: {
        type: "object",
        properties: {
          spaceIdOrKey: { type: "string", description: "Space ID (numeric) or key (e.g., 'MYSPACE'). Required." },
        },
        required: ["spaceIdOrKey"],
      },
      handler: async (params) => {
        try {
          const { spaceIdOrKey } = params as { spaceIdOrKey: string };
          const space = /^\d+$/.test(spaceIdOrKey) ? await api.confluenceGetSpace(spaceIdOrKey) : await api.confluenceGetSpaceByKey(spaceIdOrKey);
          return formatResult(space);
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // confluence_get_pages
    {
      name: "confluence_get_pages",
      description: "List pages in a Confluence space.",
      inputSchema: {
        type: "object",
        properties: {
          spaceId: { type: "string", description: "Space ID (numeric). Required. Use confluence_get_space to get ID from key." },
          limit: { type: "number", description: "Maximum results to return. Default: 25" },
          cursor: { type: "string", description: "Pagination cursor for next page." },
        },
        required: ["spaceId"],
      },
      handler: async (params) => {
        try {
          const { spaceId, limit = 25, cursor } = params as { spaceId: string; limit?: number; cursor?: string };
          const res = await api.confluenceGetPages(spaceId, limit, cursor);
          return formatResult({ pages: res.results.map((p) => ({ id: p.id, title: p.title, status: p.status, version: p.version?.number })), next: res._links?.next });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // confluence_get_page
    {
      name: "confluence_get_page",
      description: "Get a Confluence page by ID with its content.",
      inputSchema: {
        type: "object",
        properties: {
          pageId: { type: "string", description: "Page ID. Required." },
          bodyFormat: { type: "string", enum: ["storage", "atlas_doc_format"], description: "Body format. Default: storage (XHTML)." },
        },
        required: ["pageId"],
      },
      handler: async (params) => {
        try {
          const { pageId, bodyFormat = "storage" } = params as { pageId: string; bodyFormat?: "storage" | "atlas_doc_format" };
          const p = await api.confluenceGetPage(pageId, bodyFormat);
          return formatResult({ id: p.id, title: p.title, status: p.status, spaceId: p.spaceId, version: p.version?.number, body: p.body?.storage?.value || p.body?.atlas_doc_format?.value, webui: p._links?.webui });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // confluence_create_page
    {
      name: "confluence_create_page",
      description: "Create a new Confluence page.",
      inputSchema: {
        type: "object",
        properties: {
          spaceId: { type: "string", description: "Space ID (numeric). Required." },
          title: { type: "string", description: "Page title. Required." },
          body: { type: "string", description: "Page body in storage format (XHTML). Required." },
          parentId: { type: "string", description: "Parent page ID for nested pages." },
        },
        required: ["spaceId", "title", "body"],
      },
      handler: async (params) => {
        try {
          const p = await api.confluenceCreatePage(params as api.ConfluenceCreatePageParams);
          return formatResult({ created: true, id: p.id, title: p.title, version: p.version?.number });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // confluence_update_page
    {
      name: "confluence_update_page",
      description: "Update an existing Confluence page.",
      inputSchema: {
        type: "object",
        properties: {
          pageId: { type: "string", description: "Page ID. Required." },
          title: { type: "string", description: "New page title. Required." },
          body: { type: "string", description: "New page body in storage format (XHTML). Required." },
          version: { type: "number", description: "Current version number (must be incremented). Required." },
        },
        required: ["pageId", "title", "body", "version"],
      },
      handler: async (params) => {
        try {
          const p = await api.confluenceUpdatePage(params as api.ConfluenceUpdatePageParams);
          return formatResult({ updated: true, id: p.id, title: p.title, version: p.version?.number });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // confluence_delete_page
    {
      name: "confluence_delete_page",
      description: "Delete a Confluence page.",
      inputSchema: {
        type: "object",
        properties: { pageId: { type: "string", description: "Page ID. Required." } },
        required: ["pageId"],
      },
      handler: async (params) => {
        try {
          await api.confluenceDeletePage((params as { pageId: string }).pageId);
          return formatResult({ deleted: true });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // confluence_search
    {
      name: "confluence_search",
      description: "Search Confluence content using CQL (Confluence Query Language). Example: 'type=page AND space=MYSPACE AND text~\"keyword\"'",
      inputSchema: {
        type: "object",
        properties: {
          cql: { type: "string", description: "CQL query string. Required." },
          limit: { type: "number", description: "Maximum results to return. Default: 25" },
          start: { type: "number", description: "Starting index for pagination. Default: 0" },
        },
        required: ["cql"],
      },
      handler: async (params) => {
        try {
          const { cql, limit = 25, start = 0 } = params as { cql: string; limit?: number; start?: number };
          const res = await api.confluenceSearch(cql, limit, start);
          return formatResult({
            totalSize: res.totalSize, size: res.size,
            results: res.results.map((r) => ({ id: r.content?.id, type: r.content?.type, title: r.content?.title, space: r.content?.space?.key, excerpt: r.excerpt })),
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // confluence_get_page_comments
    {
      name: "confluence_get_page_comments",
      description: "Get comments on a Confluence page.",
      inputSchema: {
        type: "object",
        properties: {
          pageId: { type: "string", description: "Page ID. Required." },
          limit: { type: "number", description: "Maximum results to return. Default: 25" },
          cursor: { type: "string", description: "Pagination cursor for next page." },
        },
        required: ["pageId"],
      },
      handler: async (params) => {
        try {
          const { pageId, limit = 25, cursor } = params as { pageId: string; limit?: number; cursor?: string };
          const res = await api.confluenceGetPageComments(pageId, limit, cursor);
          return formatResult({ pageId, comments: res.results.map((c) => ({ id: c.id, body: c.body?.storage?.value, created: c.version?.createdAt })), next: res._links?.next });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // confluence_add_page_comment
    {
      name: "confluence_add_page_comment",
      description: "Add a comment to a Confluence page.",
      inputSchema: {
        type: "object",
        properties: {
          pageId: { type: "string", description: "Page ID. Required." },
          body: { type: "string", description: "Comment body in storage format (XHTML). Required." },
        },
        required: ["pageId", "body"],
      },
      handler: async (params) => {
        try {
          const { pageId, body } = params as { pageId: string; body: string };
          const c = await api.confluenceAddPageComment(pageId, body);
          return formatResult({ added: true, pageId, commentId: c.id });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // confluence_get_page_labels
    {
      name: "confluence_get_page_labels",
      description: "Get labels on a Confluence page.",
      inputSchema: {
        type: "object",
        properties: { pageId: { type: "string", description: "Page ID. Required." } },
        required: ["pageId"],
      },
      handler: async (params) => {
        try {
          const res = await api.confluenceGetPageLabels((params as { pageId: string }).pageId);
          return formatResult({ labels: res.results.map((l) => ({ id: l.id, name: l.name, prefix: l.prefix })) });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // confluence_add_page_label
    {
      name: "confluence_add_page_label",
      description: "Add a label to a Confluence page.",
      inputSchema: {
        type: "object",
        properties: {
          pageId: { type: "string", description: "Page ID. Required." },
          label: { type: "string", description: "Label name. Required." },
        },
        required: ["pageId", "label"],
      },
      handler: async (params) => {
        try {
          const { pageId, label } = params as { pageId: string; label: string };
          const l = await api.confluenceAddPageLabel(pageId, label);
          return formatResult({ added: true, pageId, label: l.name });
        } catch (error) {
          return formatError(error);
        }
      },
    },
  ];
}
