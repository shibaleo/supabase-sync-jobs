// packages/console/src/app/api/mcp/modules/confluence/schema.ts

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
    name: "confluence_list_spaces",
    description: "List all Confluence spaces accessible to the current user.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum results to return. Default: 25" },
        cursor: { type: "string", description: "Pagination cursor for next page." },
      },
    },
  },
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
  },
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
  },
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
  },
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
  },
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
  },
  {
    name: "confluence_delete_page",
    description: "Delete a Confluence page.",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "Page ID. Required." },
      },
      required: ["pageId"],
    },
  },
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
  },
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
  },
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
  },
  {
    name: "confluence_get_page_labels",
    description: "Get labels on a Confluence page.",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "Page ID. Required." },
      },
      required: ["pageId"],
    },
  },
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
  },
];

// Handlers - all receive userId as second parameter
async function listSpaces(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const { limit = 25, cursor } = params as { limit?: number; cursor?: string };
    const res = await api.confluenceListSpaces(userId, limit, cursor);
    return formatResult({
      spaces: res.results.map((s) => ({ id: s.id, key: s.key, name: s.name, type: s.type })),
      next: res._links?.next,
    });
  } catch (error) {
    return formatError(error);
  }
}

async function getSpace(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const { spaceIdOrKey } = params as { spaceIdOrKey: string };
    const space = /^\d+$/.test(spaceIdOrKey)
      ? await api.confluenceGetSpace(userId, spaceIdOrKey)
      : await api.confluenceGetSpaceByKey(userId, spaceIdOrKey);
    return formatResult(space);
  } catch (error) {
    return formatError(error);
  }
}

async function getPages(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const { spaceId, limit = 25, cursor } = params as {
      spaceId: string;
      limit?: number;
      cursor?: string;
    };
    const res = await api.confluenceGetPages(userId, spaceId, limit, cursor);
    return formatResult({
      pages: res.results.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        version: p.version?.number,
      })),
      next: res._links?.next,
    });
  } catch (error) {
    return formatError(error);
  }
}

async function getPage(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const { pageId, bodyFormat = "storage" } = params as {
      pageId: string;
      bodyFormat?: "storage" | "atlas_doc_format";
    };
    const p = await api.confluenceGetPage(userId, pageId, bodyFormat);
    return formatResult({
      id: p.id,
      title: p.title,
      status: p.status,
      spaceId: p.spaceId,
      version: p.version?.number,
      body: p.body?.storage?.value || p.body?.atlas_doc_format?.value,
      webui: p._links?.webui,
    });
  } catch (error) {
    return formatError(error);
  }
}

async function createPage(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const p = await api.confluenceCreatePage(userId, {
      spaceId: params.spaceId as string,
      title: params.title as string,
      body: params.body as string,
      parentId: params.parentId as string | undefined,
    });
    return formatResult({ created: true, id: p.id, title: p.title, version: p.version?.number });
  } catch (error) {
    return formatError(error);
  }
}

async function updatePage(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const p = await api.confluenceUpdatePage(userId, {
      pageId: params.pageId as string,
      title: params.title as string,
      body: params.body as string,
      version: params.version as number,
    });
    return formatResult({ updated: true, id: p.id, title: p.title, version: p.version?.number });
  } catch (error) {
    return formatError(error);
  }
}

async function deletePage(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    await api.confluenceDeletePage(userId, (params as { pageId: string }).pageId);
    return formatResult({ deleted: true });
  } catch (error) {
    return formatError(error);
  }
}

async function search(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const { cql, limit = 25, start = 0 } = params as {
      cql: string;
      limit?: number;
      start?: number;
    };
    const res = await api.confluenceSearch(userId, cql, limit, start);
    return formatResult({
      totalSize: res.totalSize,
      size: res.size,
      results: res.results.map((r) => ({
        id: r.content?.id,
        type: r.content?.type,
        title: r.content?.title,
        space: r.content?.space?.key,
        excerpt: r.excerpt,
      })),
    });
  } catch (error) {
    return formatError(error);
  }
}

async function getPageComments(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const { pageId, limit = 25, cursor } = params as {
      pageId: string;
      limit?: number;
      cursor?: string;
    };
    const res = await api.confluenceGetPageComments(userId, pageId, limit, cursor);
    return formatResult({
      pageId,
      comments: res.results.map((c) => ({
        id: c.id,
        body: c.body?.storage?.value,
        created: c.version?.createdAt,
      })),
      next: res._links?.next,
    });
  } catch (error) {
    return formatError(error);
  }
}

async function addPageComment(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const { pageId, body } = params as { pageId: string; body: string };
    const c = await api.confluenceAddPageComment(userId, pageId, body);
    return formatResult({ added: true, pageId, commentId: c.id });
  } catch (error) {
    return formatError(error);
  }
}

async function getPageLabels(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const res = await api.confluenceGetPageLabels(userId, (params as { pageId: string }).pageId);
    return formatResult({
      labels: res.results.map((l) => ({ id: l.id, name: l.name, prefix: l.prefix })),
    });
  } catch (error) {
    return formatError(error);
  }
}

async function addPageLabel(params: Record<string, unknown>, userId: string): Promise<McpToolResult> {
  try {
    const { pageId, label } = params as { pageId: string; label: string };
    const l = await api.confluenceAddPageLabel(userId, pageId, label);
    return formatResult({ added: true, pageId, label: l.name });
  } catch (error) {
    return formatError(error);
  }
}

const handlers: Record<string, ToolHandler> = {
  confluence_list_spaces: listSpaces,
  confluence_get_space: getSpace,
  confluence_get_pages: getPages,
  confluence_get_page: getPage,
  confluence_create_page: createPage,
  confluence_update_page: updatePage,
  confluence_delete_page: deletePage,
  confluence_search: search,
  confluence_get_page_comments: getPageComments,
  confluence_add_page_comment: addPageComment,
  confluence_get_page_labels: getPageLabels,
  confluence_add_page_label: addPageLabel,
};

export const confluenceModule: ModuleDefinition = {
  name: "confluence",
  description: "Confluence Wiki 操作（スペース、ページ、検索、コメント、ラベル）",
  tools,
  handlers,
};
