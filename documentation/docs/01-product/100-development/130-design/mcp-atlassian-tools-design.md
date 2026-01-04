---
title: Atlassian MCP Tools 詳細設計書
description: Jira・Confluence MCP ツールの詳細設計
status: Jira完了、Confluence未着手
---

# Atlassian MCP Tools 詳細設計書

## 概要

本ドキュメントは Atlassian（Jira / Confluence）の MCP ツールの詳細設計を記述する。
公式の atlassian/mcp-server-atlassian が提供するツールを参考に、重複なく実装する。

### 目的

1. **Jira**: タスク管理・Issue操作をMCPから実行可能に（実装済み）
2. **Confluence**: ドキュメント管理・ページ操作をMCPから実行可能に（本設計の対象）

---

## 公式ツールと実装マッピング

### Atlassian公式ツール一覧（28ツール）

| 公式ツール名 | 対象 | 実装先 | 実装状況 |
|-------------|------|--------|----------|
| `atlassianUserInfo` | 共通 | Jira (`jira_get_myself`) | 実装済み |
| `getAccessibleAtlassianResources` | 共通 | Jira | 不要（単一リソース前提） |
| `lookupJiraAccountId` | Jira | 未実装 | 追加検討 |
| **Jira - Projects** |
| `getVisibleJiraProjects` | Jira | `jira_list_projects` | 実装済み |
| `getJiraProjectIssueTypesMetadata` | Jira | 未実装 | 追加予定 |
| `getJiraIssueTypeMetaWithFields` | Jira | 未実装 | 追加予定 |
| **Jira - Issues** |
| `searchJiraIssuesUsingJql` | Jira | `jira_search` | 実装済み |
| `getJiraIssue` | Jira | `jira_get_issue` | 実装済み |
| `createJiraIssue` | Jira | `jira_create_issue` | 実装済み |
| `editJiraIssue` | Jira | `jira_update_issue` | 実装済み |
| **Jira - Transitions** |
| `getTransitionsForJiraIssue` | Jira | `jira_get_transitions` | 実装済み |
| `transitionJiraIssue` | Jira | `jira_transition_issue` | 実装済み |
| **Jira - Comments & Worklogs** |
| `addCommentToJiraIssue` | Jira | `jira_add_comment` | 実装済み |
| `addWorklogToJiraIssue` | Jira | 未実装 | 追加予定 |
| **Jira - Links** |
| `getJiraIssueRemoteIssueLinks` | Jira | 未実装 | 追加予定 |
| **Confluence - Spaces** |
| `getConfluenceSpaces` | Confluence | `confluence_list_spaces` | 本設計 |
| **Confluence - Pages** |
| `getPagesInConfluenceSpace` | Confluence | `confluence_list_pages` | 本設計 |
| `getConfluencePage` | Confluence | `confluence_get_page` | 本設計 |
| `getConfluencePageDescendants` | Confluence | `confluence_get_descendants` | 本設計 |
| `createConfluencePage` | Confluence | `confluence_create_page` | 本設計 |
| `updateConfluencePage` | Confluence | `confluence_update_page` | 本設計 |
| **Confluence - Comments** |
| `getConfluencePageFooterComments` | Confluence | `confluence_get_footer_comments` | 本設計 |
| `getConfluencePageInlineComments` | Confluence | `confluence_get_inline_comments` | 本設計 |
| `createConfluenceFooterComment` | Confluence | `confluence_add_footer_comment` | 本設計 |
| `createConfluenceInlineComment` | Confluence | `confluence_add_inline_comment` | 本設計 |
| **Search** |
| `search` | 共通 | 分割実装 | 本設計 |
| `searchConfluenceUsingCql` | Confluence | `confluence_search` | 本設計 |
| **Generic** |
| `fetch` | 共通 | 不要 | 個別API実装 |

---

## Jira追加ツール設計

### 追加予定ツール（4ツール）

#### 1. `jira_lookup_account_id`

```typescript
{
  name: "jira_lookup_account_id",
  description: "Look up a Jira user's account ID by email or display name.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Email address or display name to search for. Required.",
      },
    },
    required: ["query"],
  },
}
```

**API**: `GET /rest/api/3/user/search?query={query}`

#### 2. `jira_get_issue_type_metadata`

```typescript
{
  name: "jira_get_issue_type_metadata",
  description: "Get issue type metadata with available fields for a project.",
  inputSchema: {
    type: "object",
    properties: {
      projectKey: {
        type: "string",
        description: "Project key (e.g., 'PROJ'). Required.",
      },
      issueTypeId: {
        type: "string",
        description: "Issue type ID. If not specified, returns all issue types.",
      },
    },
    required: ["projectKey"],
  },
}
```

**API**: `GET /rest/api/3/issue/createmeta/{projectIdOrKey}/issuetypes`

#### 3. `jira_add_worklog`

```typescript
{
  name: "jira_add_worklog",
  description: "Add a worklog entry to a Jira issue.",
  inputSchema: {
    type: "object",
    properties: {
      issueKey: {
        type: "string",
        description: "Issue key (e.g., 'PROJ-123'). Required.",
      },
      timeSpent: {
        type: "string",
        description: "Time spent in Jira format (e.g., '2h 30m', '1d'). Required.",
      },
      started: {
        type: "string",
        description: "When the work started (ISO 8601). Defaults to now.",
      },
      comment: {
        type: "string",
        description: "Optional comment for the worklog.",
      },
    },
    required: ["issueKey", "timeSpent"],
  },
}
```

**API**: `POST /rest/api/3/issue/{issueIdOrKey}/worklog`

#### 4. `jira_get_remote_links`

```typescript
{
  name: "jira_get_remote_links",
  description: "Get remote issue links for a Jira issue.",
  inputSchema: {
    type: "object",
    properties: {
      issueKey: {
        type: "string",
        description: "Issue key (e.g., 'PROJ-123'). Required.",
      },
    },
    required: ["issueKey"],
  },
}
```

**API**: `GET /rest/api/3/issue/{issueIdOrKey}/remotelink`

---

## Confluence ツール設計

### ディレクトリ構成

```
supabase/functions/personal-context/tools/
├── jira/
│   ├── client.ts      # 既存
│   └── tools.ts       # 既存 + 追加ツール
└── confluence/
    ├── client.ts      # 新規：Confluence APIクライアント
    └── tools.ts       # 新規：Confluence MCPツール定義
```

### 認証

JiraとConfluenceは同じAtlassian資格情報を使用。
既存の `console.get_service_secret({ service_name: "jira" })` で取得した `domain`, `email`, `api_token` を共用する。

ただし、Confluence APIはAPIバージョンが異なる：
- Jira: `/rest/api/3/...`
- Confluence: `/wiki/api/v2/...` (または `/wiki/rest/api/content/...` for v1)

---

### client.ts 設計

```typescript
// supabase/functions/personal-context/tools/confluence/client.ts

import { createClient } from "@supabase/supabase-js";

interface AtlassianCredentials {
  email: string;
  api_token: string;
  domain: string;  // e.g., "your-domain.atlassian.net"
}

let cachedCredentials: AtlassianCredentials | null = null;

async function getCredentials(): Promise<AtlassianCredentials> {
  if (cachedCredentials) return cachedCredentials;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("console")
    .rpc("get_service_secret", { service_name: "jira" }); // 共用

  if (error || !data) throw new Error("Atlassian credentials not found");

  cachedCredentials = data as AtlassianCredentials;
  return cachedCredentials;
}

export interface ConfluenceApiError {
  status: number;
  message?: string;
  errors?: unknown[];
}

// Confluence API v2 を使用
async function confluenceRequest<T>(
  method: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  const credentials = await getCredentials();
  const auth = btoa(`${credentials.email}:${credentials.api_token}`);
  const url = `https://${credentials.domain}/wiki/api/v2${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw {
      status: response.status,
      message: errorData.message || `Confluence API error: ${response.status}`,
      errors: errorData.errors,
    } as ConfluenceApiError;
  }

  if (response.status === 204) return {} as T;
  return response.json();
}
```

---

### Confluence ツール一覧（11ツール）

#### 1. Spaces（1ツール）

##### `confluence_list_spaces`

```typescript
{
  name: "confluence_list_spaces",
  description: "List all Confluence spaces accessible to the current user.",
  inputSchema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["global", "personal"],
        description: "Filter by space type. Default: all types.",
      },
      status: {
        type: "string",
        enum: ["current", "archived"],
        description: "Filter by space status. Default: current.",
      },
      limit: {
        type: "number",
        description: "Maximum results to return. Default: 25",
      },
      cursor: {
        type: "string",
        description: "Pagination cursor for next page.",
      },
    },
  },
}
```

**API**: `GET /wiki/api/v2/spaces`

---

#### 2. Pages（5ツール）

##### `confluence_list_pages`

```typescript
{
  name: "confluence_list_pages",
  description: "List pages in a Confluence space.",
  inputSchema: {
    type: "object",
    properties: {
      spaceId: {
        type: "string",
        description: "Space ID. Required.",
      },
      status: {
        type: "string",
        enum: ["current", "trashed", "draft"],
        description: "Page status. Default: current.",
      },
      title: {
        type: "string",
        description: "Filter by page title (partial match).",
      },
      limit: {
        type: "number",
        description: "Maximum results to return. Default: 25",
      },
      cursor: {
        type: "string",
        description: "Pagination cursor.",
      },
    },
    required: ["spaceId"],
  },
}
```

**API**: `GET /wiki/api/v2/spaces/{spaceId}/pages`

##### `confluence_get_page`

```typescript
{
  name: "confluence_get_page",
  description: "Get a Confluence page by ID, including its content.",
  inputSchema: {
    type: "object",
    properties: {
      pageId: {
        type: "string",
        description: "Page ID. Required.",
      },
      bodyFormat: {
        type: "string",
        enum: ["storage", "atlas_doc_format", "view"],
        description: "Format for page body. Default: storage (HTML-like).",
      },
      includeVersion: {
        type: "boolean",
        description: "Include version information. Default: false.",
      },
    },
    required: ["pageId"],
  },
}
```

**API**: `GET /wiki/api/v2/pages/{pageId}?body-format={bodyFormat}`

##### `confluence_get_descendants`

```typescript
{
  name: "confluence_get_descendants",
  description: "Get child pages (descendants) of a Confluence page.",
  inputSchema: {
    type: "object",
    properties: {
      pageId: {
        type: "string",
        description: "Parent page ID. Required.",
      },
      depth: {
        type: "string",
        enum: ["child", "all"],
        description: "Depth of descendants. 'child' = direct children only, 'all' = all descendants. Default: child.",
      },
      limit: {
        type: "number",
        description: "Maximum results to return. Default: 25",
      },
      cursor: {
        type: "string",
        description: "Pagination cursor.",
      },
    },
    required: ["pageId"],
  },
}
```

**API**: `GET /wiki/api/v2/pages/{pageId}/children` or `/pages/{pageId}/descendants`

##### `confluence_create_page`

```typescript
{
  name: "confluence_create_page",
  description: "Create a new Confluence page.",
  inputSchema: {
    type: "object",
    properties: {
      spaceId: {
        type: "string",
        description: "Space ID where the page will be created. Required.",
      },
      title: {
        type: "string",
        description: "Page title. Required.",
      },
      body: {
        type: "string",
        description: "Page content in storage format (XHTML). Required.",
      },
      parentId: {
        type: "string",
        description: "Parent page ID. If not specified, creates at space root.",
      },
      status: {
        type: "string",
        enum: ["current", "draft"],
        description: "Page status. Default: current.",
      },
    },
    required: ["spaceId", "title", "body"],
  },
}
```

**API**: `POST /wiki/api/v2/pages`

**Request Body**:
```json
{
  "spaceId": "123456",
  "status": "current",
  "title": "Page Title",
  "parentId": "789012",
  "body": {
    "representation": "storage",
    "value": "<p>Page content in XHTML format</p>"
  }
}
```

##### `confluence_update_page`

```typescript
{
  name: "confluence_update_page",
  description: "Update an existing Confluence page.",
  inputSchema: {
    type: "object",
    properties: {
      pageId: {
        type: "string",
        description: "Page ID to update. Required.",
      },
      title: {
        type: "string",
        description: "New page title. Required.",
      },
      body: {
        type: "string",
        description: "New page content in storage format (XHTML). Required.",
      },
      version: {
        type: "number",
        description: "Current version number (for optimistic locking). Required.",
      },
      status: {
        type: "string",
        enum: ["current", "draft"],
        description: "Page status. Default: current.",
      },
    },
    required: ["pageId", "title", "body", "version"],
  },
}
```

**API**: `PUT /wiki/api/v2/pages/{pageId}`

**Request Body**:
```json
{
  "id": "123456",
  "status": "current",
  "title": "Updated Title",
  "body": {
    "representation": "storage",
    "value": "<p>Updated content</p>"
  },
  "version": {
    "number": 2,
    "message": "Updated via MCP"
  }
}
```

---

#### 3. Comments（4ツール）

##### `confluence_get_footer_comments`

```typescript
{
  name: "confluence_get_footer_comments",
  description: "Get footer comments on a Confluence page.",
  inputSchema: {
    type: "object",
    properties: {
      pageId: {
        type: "string",
        description: "Page ID. Required.",
      },
      limit: {
        type: "number",
        description: "Maximum results to return. Default: 25",
      },
      cursor: {
        type: "string",
        description: "Pagination cursor.",
      },
    },
    required: ["pageId"],
  },
}
```

**API**: `GET /wiki/api/v2/pages/{pageId}/footer-comments`

##### `confluence_get_inline_comments`

```typescript
{
  name: "confluence_get_inline_comments",
  description: "Get inline comments on a Confluence page.",
  inputSchema: {
    type: "object",
    properties: {
      pageId: {
        type: "string",
        description: "Page ID. Required.",
      },
      limit: {
        type: "number",
        description: "Maximum results to return. Default: 25",
      },
      cursor: {
        type: "string",
        description: "Pagination cursor.",
      },
    },
    required: ["pageId"],
  },
}
```

**API**: `GET /wiki/api/v2/pages/{pageId}/inline-comments`

##### `confluence_add_footer_comment`

```typescript
{
  name: "confluence_add_footer_comment",
  description: "Add a footer comment to a Confluence page.",
  inputSchema: {
    type: "object",
    properties: {
      pageId: {
        type: "string",
        description: "Page ID. Required.",
      },
      body: {
        type: "string",
        description: "Comment text in storage format. Required.",
      },
    },
    required: ["pageId", "body"],
  },
}
```

**API**: `POST /wiki/api/v2/footer-comments`

**Request Body**:
```json
{
  "pageId": "123456",
  "body": {
    "representation": "storage",
    "value": "<p>This is a comment</p>"
  }
}
```

##### `confluence_add_inline_comment`

```typescript
{
  name: "confluence_add_inline_comment",
  description: "Add an inline comment to a Confluence page at a specific location.",
  inputSchema: {
    type: "object",
    properties: {
      pageId: {
        type: "string",
        description: "Page ID. Required.",
      },
      body: {
        type: "string",
        description: "Comment text in storage format. Required.",
      },
      inlineCommentProperties: {
        type: "object",
        description: "Properties specifying the location of the inline comment. Required.",
        properties: {
          textSelection: {
            type: "string",
            description: "Text to anchor the comment to.",
          },
          textSelectionMatchCount: {
            type: "number",
            description: "Which occurrence of the text to match (1-indexed).",
          },
        },
      },
    },
    required: ["pageId", "body", "inlineCommentProperties"],
  },
}
```

**API**: `POST /wiki/api/v2/inline-comments`

---

#### 4. Search（1ツール）

##### `confluence_search`

```typescript
{
  name: "confluence_search",
  description: "Search Confluence content using CQL (Confluence Query Language).",
  inputSchema: {
    type: "object",
    properties: {
      cql: {
        type: "string",
        description: "CQL query string. Example: 'type=page AND space=DEV AND text~\"search term\"'. Required.",
      },
      limit: {
        type: "number",
        description: "Maximum results to return. Default: 25",
      },
      cursor: {
        type: "string",
        description: "Pagination cursor.",
      },
    },
    required: ["cql"],
  },
}
```

**API**: `GET /wiki/api/v2/search?cql={cql}`

**CQL Examples**:
- `type=page AND space=DEV` - DEVスペースの全ページ
- `text~"keyword"` - キーワードを含むコンテンツ
- `creator=currentUser()` - 自分が作成したコンテンツ
- `lastModified >= "2024-01-01"` - 2024年以降に更新されたコンテンツ

---

## tools.ts 設計

```typescript
// supabase/functions/personal-context/tools/confluence/tools.ts

import { ToolDefinition, McpToolResult } from "../../mcp/types.ts";
import * as confluence from "./client.ts";

function formatResult(data: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function formatError(error: unknown): McpToolResult {
  const cfError = error as confluence.ConfluenceApiError;
  const message = cfError?.message ||
    (error instanceof Error ? error.message : "Unknown error");
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

export function getConfluenceTools(): ToolDefinition[] {
  return [
    // =========================================================================
    // Spaces
    // =========================================================================
    {
      name: "confluence_list_spaces",
      description: "List all Confluence spaces accessible to the current user.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["global", "personal"],
            description: "Filter by space type.",
          },
          status: {
            type: "string",
            enum: ["current", "archived"],
            description: "Filter by space status. Default: current.",
          },
          limit: {
            type: "number",
            description: "Maximum results to return. Default: 25",
          },
          cursor: {
            type: "string",
            description: "Pagination cursor.",
          },
        },
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const response = await confluence.listSpaces(params);
          return formatResult({
            spaces: response.results.map((s) => ({
              id: s.id,
              key: s.key,
              name: s.name,
              type: s.type,
              status: s.status,
            })),
            _links: response._links,
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // =========================================================================
    // Pages
    // =========================================================================
    {
      name: "confluence_list_pages",
      description: "List pages in a Confluence space.",
      inputSchema: {
        type: "object",
        properties: {
          spaceId: {
            type: "string",
            description: "Space ID. Required.",
          },
          status: {
            type: "string",
            enum: ["current", "trashed", "draft"],
            description: "Page status. Default: current.",
          },
          title: {
            type: "string",
            description: "Filter by page title.",
          },
          limit: {
            type: "number",
            description: "Maximum results. Default: 25",
          },
          cursor: {
            type: "string",
            description: "Pagination cursor.",
          },
        },
        required: ["spaceId"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const { spaceId, ...options } = params as { spaceId: string };
          const response = await confluence.listPages(spaceId, options);
          return formatResult({
            pages: response.results.map((p) => ({
              id: p.id,
              title: p.title,
              status: p.status,
              parentId: p.parentId,
              spaceId: p.spaceId,
            })),
            _links: response._links,
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    {
      name: "confluence_get_page",
      description: "Get a Confluence page by ID.",
      inputSchema: {
        type: "object",
        properties: {
          pageId: {
            type: "string",
            description: "Page ID. Required.",
          },
          bodyFormat: {
            type: "string",
            enum: ["storage", "atlas_doc_format", "view"],
            description: "Body format. Default: storage.",
          },
        },
        required: ["pageId"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const { pageId, bodyFormat = "storage" } = params as {
            pageId: string;
            bodyFormat?: string;
          };
          const page = await confluence.getPage(pageId, bodyFormat);
          return formatResult({
            id: page.id,
            title: page.title,
            status: page.status,
            spaceId: page.spaceId,
            parentId: page.parentId,
            version: page.version?.number,
            body: page.body?.storage?.value || page.body?.atlas_doc_format?.value,
            createdAt: page.createdAt,
            authorId: page.authorId,
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    {
      name: "confluence_get_descendants",
      description: "Get child pages of a Confluence page.",
      inputSchema: {
        type: "object",
        properties: {
          pageId: {
            type: "string",
            description: "Parent page ID. Required.",
          },
          depth: {
            type: "string",
            enum: ["child", "all"],
            description: "Depth. Default: child.",
          },
          limit: {
            type: "number",
            description: "Maximum results. Default: 25",
          },
          cursor: {
            type: "string",
            description: "Pagination cursor.",
          },
        },
        required: ["pageId"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const { pageId, ...options } = params as { pageId: string };
          const response = await confluence.getDescendants(pageId, options);
          return formatResult({
            pages: response.results.map((p) => ({
              id: p.id,
              title: p.title,
              status: p.status,
              parentId: p.parentId,
            })),
            _links: response._links,
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    {
      name: "confluence_create_page",
      description: "Create a new Confluence page.",
      inputSchema: {
        type: "object",
        properties: {
          spaceId: {
            type: "string",
            description: "Space ID. Required.",
          },
          title: {
            type: "string",
            description: "Page title. Required.",
          },
          body: {
            type: "string",
            description: "Page content in storage format (XHTML). Required.",
          },
          parentId: {
            type: "string",
            description: "Parent page ID.",
          },
          status: {
            type: "string",
            enum: ["current", "draft"],
            description: "Page status. Default: current.",
          },
        },
        required: ["spaceId", "title", "body"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const page = await confluence.createPage(params as confluence.CreatePageParams);
          return formatResult({
            created: true,
            id: page.id,
            title: page.title,
            spaceId: page.spaceId,
            version: page.version?.number,
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    {
      name: "confluence_update_page",
      description: "Update an existing Confluence page.",
      inputSchema: {
        type: "object",
        properties: {
          pageId: {
            type: "string",
            description: "Page ID. Required.",
          },
          title: {
            type: "string",
            description: "New title. Required.",
          },
          body: {
            type: "string",
            description: "New content in storage format. Required.",
          },
          version: {
            type: "number",
            description: "Current version number. Required.",
          },
          status: {
            type: "string",
            enum: ["current", "draft"],
            description: "Page status. Default: current.",
          },
        },
        required: ["pageId", "title", "body", "version"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const { pageId, ...updateParams } = params as {
            pageId: string;
            title: string;
            body: string;
            version: number;
            status?: string;
          };
          const page = await confluence.updatePage(pageId, updateParams);
          return formatResult({
            updated: true,
            id: page.id,
            title: page.title,
            version: page.version?.number,
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // =========================================================================
    // Comments
    // =========================================================================
    {
      name: "confluence_get_footer_comments",
      description: "Get footer comments on a Confluence page.",
      inputSchema: {
        type: "object",
        properties: {
          pageId: {
            type: "string",
            description: "Page ID. Required.",
          },
          limit: {
            type: "number",
            description: "Maximum results. Default: 25",
          },
          cursor: {
            type: "string",
            description: "Pagination cursor.",
          },
        },
        required: ["pageId"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const { pageId, ...options } = params as { pageId: string };
          const response = await confluence.getFooterComments(pageId, options);
          return formatResult({
            comments: response.results.map((c) => ({
              id: c.id,
              body: c.body?.storage?.value,
              createdAt: c.createdAt,
              version: c.version?.number,
            })),
            _links: response._links,
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    {
      name: "confluence_get_inline_comments",
      description: "Get inline comments on a Confluence page.",
      inputSchema: {
        type: "object",
        properties: {
          pageId: {
            type: "string",
            description: "Page ID. Required.",
          },
          limit: {
            type: "number",
            description: "Maximum results. Default: 25",
          },
          cursor: {
            type: "string",
            description: "Pagination cursor.",
          },
        },
        required: ["pageId"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const { pageId, ...options } = params as { pageId: string };
          const response = await confluence.getInlineComments(pageId, options);
          return formatResult({
            comments: response.results.map((c) => ({
              id: c.id,
              body: c.body?.storage?.value,
              createdAt: c.createdAt,
              textSelection: c.properties?.textSelection,
            })),
            _links: response._links,
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    {
      name: "confluence_add_footer_comment",
      description: "Add a footer comment to a Confluence page.",
      inputSchema: {
        type: "object",
        properties: {
          pageId: {
            type: "string",
            description: "Page ID. Required.",
          },
          body: {
            type: "string",
            description: "Comment text. Required.",
          },
        },
        required: ["pageId", "body"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const { pageId, body } = params as { pageId: string; body: string };
          const comment = await confluence.addFooterComment(pageId, body);
          return formatResult({
            added: true,
            id: comment.id,
            createdAt: comment.createdAt,
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    {
      name: "confluence_add_inline_comment",
      description: "Add an inline comment to a Confluence page.",
      inputSchema: {
        type: "object",
        properties: {
          pageId: {
            type: "string",
            description: "Page ID. Required.",
          },
          body: {
            type: "string",
            description: "Comment text. Required.",
          },
          textSelection: {
            type: "string",
            description: "Text to anchor the comment to. Required.",
          },
          textSelectionMatchCount: {
            type: "number",
            description: "Which occurrence of the text (1-indexed). Default: 1.",
          },
        },
        required: ["pageId", "body", "textSelection"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const { pageId, body, textSelection, textSelectionMatchCount = 1 } = params as {
            pageId: string;
            body: string;
            textSelection: string;
            textSelectionMatchCount?: number;
          };
          const comment = await confluence.addInlineComment(pageId, body, {
            textSelection,
            textSelectionMatchCount,
          });
          return formatResult({
            added: true,
            id: comment.id,
            createdAt: comment.createdAt,
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // =========================================================================
    // Search
    // =========================================================================
    {
      name: "confluence_search",
      description: "Search Confluence using CQL (Confluence Query Language).",
      inputSchema: {
        type: "object",
        properties: {
          cql: {
            type: "string",
            description: "CQL query. Example: 'type=page AND text~\"keyword\"'. Required.",
          },
          limit: {
            type: "number",
            description: "Maximum results. Default: 25",
          },
          cursor: {
            type: "string",
            description: "Pagination cursor.",
          },
        },
        required: ["cql"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const { cql, limit = 25, cursor } = params as {
            cql: string;
            limit?: number;
            cursor?: string;
          };
          const response = await confluence.search(cql, limit, cursor);
          return formatResult({
            results: response.results.map((r) => ({
              id: r.content?.id,
              type: r.content?.type,
              title: r.content?.title,
              spaceId: r.content?.spaceId,
              excerpt: r.excerpt,
              url: r.url,
            })),
            _links: response._links,
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },
  ];
}
```

---

## プロトコル統合

### mcp/protocol.ts への追加

```typescript
// supabase/functions/personal-context/mcp/protocol.ts

import { getJiraTools } from "../tools/jira/tools.ts";
import { getConfluenceTools } from "../tools/confluence/tools.ts";
// ... 他のツール

const allTools: ToolDefinition[] = [
  ...getJiraTools(),
  ...getConfluenceTools(),  // 追加
  // ... 他のツール
];
```

---

## 実装チェックリスト

### Jira 追加ツール（4ツール）

- [ ] `jira_lookup_account_id`
- [ ] `jira_get_issue_type_metadata`
- [ ] `jira_add_worklog`
- [ ] `jira_get_remote_links`

### Confluence ツール（11ツール）

#### Spaces
- [ ] `confluence_list_spaces`

#### Pages
- [ ] `confluence_list_pages`
- [ ] `confluence_get_page`
- [ ] `confluence_get_descendants`
- [ ] `confluence_create_page`
- [ ] `confluence_update_page`

#### Comments
- [ ] `confluence_get_footer_comments`
- [ ] `confluence_get_inline_comments`
- [ ] `confluence_add_footer_comment`
- [ ] `confluence_add_inline_comment`

#### Search
- [ ] `confluence_search`

### 統合・テスト

- [ ] `confluence/client.ts` 実装
- [ ] `confluence/tools.ts` 実装
- [ ] `mcp/protocol.ts` 更新
- [ ] ローカルテスト
- [ ] 本番デプロイ

---

## 関連ドキュメント

- [Personal Context Edge Function 詳細設計書](./personal-context-edge-function-design.md)
- [atlassian/mcp-server-atlassian](https://github.com/atlassian/mcp-server-atlassian)
- [Confluence REST API v2](https://developer.atlassian.com/cloud/confluence/rest/v2/intro/)
- [Jira REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/)
