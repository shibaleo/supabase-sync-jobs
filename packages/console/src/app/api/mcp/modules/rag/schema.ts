// packages/console/src/app/api/mcp/modules/rag/schema.ts

import {
  ModuleDefinition,
  ToolDefinition,
  ToolHandler,
  McpToolResult,
} from "../../lib/types";
import { embedQuery } from "./embedder";
import * as repository from "./repository";

const SIMILARITY_THRESHOLD = 0;

const tools: ToolDefinition[] = [
  {
    name: "search_docs",
    description:
      "Search personal documents using semantic similarity. Returns relevant chunks with titles and file paths.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query in natural language",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter by tags (optional)",
        },
        document_class: {
          type: "string",
          description:
            "Filter by document-class (e.g., 'note', 'journal', 'specification')",
        },
        document_type: {
          type: "string",
          description:
            "Filter by document-type (e.g., 'daily', 'survey', 'technical')",
        },
        limit: {
          type: "number",
          default: 5,
          description: "Number of results to return",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_doc",
    description: "Get full content of a document by file path.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Document file path" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "list_tags",
    description: "List all available tags with their usage count.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_docs_by_tag",
    description:
      "List documents by tag. Use for browsing by category instead of semantic search. Supports random sampling.",
    inputSchema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "Tag to filter by" },
        limit: {
          type: "number",
          default: 5,
          description: "Number of documents to return",
        },
        random: {
          type: "boolean",
          default: false,
          description: "If true, return random documents",
        },
      },
      required: ["tag"],
    },
  },
  {
    name: "list_all_docs",
    description: "List all documents with pagination. No embedding required.",
    inputSchema: {
      type: "object",
      properties: {
        offset: {
          type: "number",
          default: 0,
          description: "Starting position",
        },
        limit: {
          type: "number",
          default: 20,
          description: "Number of documents (max 100)",
        },
      },
    },
  },
  {
    name: "search_by_keyword",
    description:
      "Search documents by keywords in content. Supports multiple keywords (OR search). No embedding required.",
    inputSchema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "Keywords to search for (case-insensitive, OR logic)",
        },
        limit: { type: "number", default: 10, description: "Number of results" },
      },
      required: ["keywords"],
    },
  },
  {
    name: "search_by_title",
    description:
      "Search documents by title using partial match. No embedding required.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (case-insensitive)",
        },
        limit: { type: "number", default: 10, description: "Number of results" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_docs_by_date",
    description:
      "List documents by date extracted from file path (YYYYMMDD format). No embedding required.",
    inputSchema: {
      type: "object",
      properties: {
        sort: {
          type: "string",
          enum: ["asc", "desc"],
          default: "desc",
          description: "Sort order",
        },
        after: {
          type: "string",
          description: "Filter after this date (YYYYMMDD)",
        },
        before: {
          type: "string",
          description: "Filter before this date (YYYYMMDD)",
        },
        limit: {
          type: "number",
          default: 5,
          description: "Number of documents",
        },
      },
    },
  },
  {
    name: "list_docs_by_frontmatter_date",
    description:
      "List documents by created or updated date from frontmatter (ISO 8601). No embedding required.",
    inputSchema: {
      type: "object",
      properties: {
        date_field: {
          type: "string",
          enum: ["created", "updated"],
          default: "created",
          description: "Which date field to use",
        },
        sort: {
          type: "string",
          enum: ["asc", "desc"],
          default: "desc",
          description: "Sort order",
        },
        after: {
          type: "string",
          description: "Filter after this datetime (ISO 8601)",
        },
        before: {
          type: "string",
          description: "Filter before this datetime (ISO 8601)",
        },
        limit: {
          type: "number",
          default: 10,
          description: "Number of documents",
        },
      },
    },
  },
];

// Handler implementations
async function searchDocs(
  params: Record<string, unknown>
): Promise<McpToolResult> {
  const {
    query,
    tags,
    document_class,
    document_type,
    limit = 5,
  } = params as {
    query: string;
    tags?: string[];
    document_class?: string;
    document_type?: string;
    limit?: number;
  };

  const queryEmbedding = await embedQuery(query);
  const results = await repository.searchChunks(
    queryEmbedding,
    tags || null,
    limit,
    SIMILARITY_THRESHOLD,
    document_class || null,
    document_type || null
  );

  if (results.length === 0) {
    return { content: [{ type: "text", text: "No matching documents found." }] };
  }

  const formatted = results.map((r) => ({
    title: r.title || "(untitled)",
    heading: r.heading,
    content: r.content,
    file_path: r.file_path,
    similarity: r.similarity.toFixed(3),
    document_class: r.document_class,
    document_type: r.document_type,
  }));

  return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
}

async function getDoc(
  params: Record<string, unknown>
): Promise<McpToolResult> {
  const { file_path } = params as { file_path: string };
  const doc = await repository.getDocument(file_path);

  if (!doc) {
    return {
      content: [{ type: "text", text: `Document not found: ${file_path}` }],
      isError: true,
    };
  }

  const tagsLine = doc.tags.length > 0 ? `Tags: ${doc.tags.join(", ")}\n\n` : "";

  return {
    content: [
      {
        type: "text",
        text: `# ${doc.title || "(untitled)"}\n\n${tagsLine}---\n\n${doc.content}`,
      },
    ],
  };
}

async function listTags(): Promise<McpToolResult> {
  const tags = await repository.listTags();

  if (tags.length === 0) {
    return { content: [{ type: "text", text: "No tags found." }] };
  }

  const formatted = tags.map((t) => `${t.tag} (${t.count})`).join("\n");
  return { content: [{ type: "text", text: formatted }] };
}

async function listDocsByTag(
  params: Record<string, unknown>
): Promise<McpToolResult> {
  const { tag, limit = 5, random = false } = params as {
    tag: string;
    limit?: number;
    random?: boolean;
  };

  const docs = await repository.listDocsByTag(tag, limit, random);

  if (docs.length === 0) {
    return {
      content: [{ type: "text", text: `No documents found with tag: ${tag}` }],
    };
  }

  const formatted = docs.map((d) => ({
    title: d.title || "(untitled)",
    file_path: d.file_path,
    tags: d.tags,
  }));

  return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
}

async function listAllDocs(
  params: Record<string, unknown>
): Promise<McpToolResult> {
  const { offset = 0, limit = 20 } = params as {
    offset?: number;
    limit?: number;
  };
  const actualLimit = Math.min(limit, 100);
  const result = await repository.listAllDocs(offset, actualLimit);

  if (result.docs.length === 0) {
    return { content: [{ type: "text", text: "No documents found." }] };
  }

  const formatted = {
    docs: result.docs.map((d) => ({
      title: d.title || "(untitled)",
      file_path: d.file_path,
      tags: d.tags,
    })),
    pagination: {
      offset,
      limit: actualLimit,
      total_count: result.total_count,
      has_more: result.has_more,
    },
  };

  return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
}

async function searchByKeyword(
  params: Record<string, unknown>
): Promise<McpToolResult> {
  const { keywords, limit = 10 } = params as {
    keywords: string[];
    limit?: number;
  };

  if (!keywords || keywords.length === 0) {
    return {
      content: [{ type: "text", text: "No keywords provided." }],
      isError: true,
    };
  }

  const docs = await repository.searchByKeyword(keywords, limit);

  if (docs.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No documents found containing: ${keywords.join(", ")}`,
        },
      ],
    };
  }

  const formatted = docs.map((d) => ({
    title: d.title || "(untitled)",
    file_path: d.file_path,
    tags: d.tags,
    snippet: d.snippet,
  }));

  return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
}

async function searchByTitle(
  params: Record<string, unknown>
): Promise<McpToolResult> {
  const { query, limit = 10 } = params as { query: string; limit?: number };
  const docs = await repository.searchByTitle(query, limit);

  if (docs.length === 0) {
    return {
      content: [
        { type: "text", text: `No documents found with title matching: ${query}` },
      ],
    };
  }

  const formatted = docs.map((d) => ({
    title: d.title || "(untitled)",
    file_path: d.file_path,
    tags: d.tags,
  }));

  return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
}

async function listDocsByDate(
  params: Record<string, unknown>
): Promise<McpToolResult> {
  const { sort = "desc", after, before, limit = 5 } = params as {
    sort?: "asc" | "desc";
    after?: string;
    before?: string;
    limit?: number;
  };

  const docs = await repository.listDocsByDate(
    sort,
    after || null,
    before || null,
    limit
  );

  if (docs.length === 0) {
    return {
      content: [
        { type: "text", text: "No documents found matching the criteria." },
      ],
    };
  }

  const formatted = docs.map((d) => ({
    title: d.title || "(untitled)",
    file_path: d.file_path,
    created_date: d.created_date,
    tags: d.tags,
  }));

  return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
}

async function listDocsByFrontmatterDate(
  params: Record<string, unknown>
): Promise<McpToolResult> {
  const {
    date_field = "created",
    sort = "desc",
    after,
    before,
    limit = 10,
  } = params as {
    date_field?: "created" | "updated";
    sort?: "asc" | "desc";
    after?: string;
    before?: string;
    limit?: number;
  };

  const docs = await repository.listDocsByFrontmatterDate(
    date_field,
    sort,
    after || null,
    before || null,
    limit
  );

  if (docs.length === 0) {
    return {
      content: [
        { type: "text", text: "No documents found matching the criteria." },
      ],
    };
  }

  const formatted = docs.map((d) => ({
    title: d.title || "(untitled)",
    file_path: d.file_path,
    created_at: d.created_at,
    updated_at: d.updated_at,
    tags: d.tags,
  }));

  return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
}

const handlers: Record<string, ToolHandler> = {
  search_docs: searchDocs,
  get_doc: getDoc,
  list_tags: listTags,
  list_docs_by_tag: listDocsByTag,
  list_all_docs: listAllDocs,
  search_by_keyword: searchByKeyword,
  search_by_title: searchByTitle,
  list_docs_by_date: listDocsByDate,
  list_docs_by_frontmatter_date: listDocsByFrontmatterDate,
};

export const ragModule: ModuleDefinition = {
  name: "rag",
  description: "ドキュメント検索（セマンティック検索、キーワード検索、タグ検索）",
  tools,
  handlers,
};
