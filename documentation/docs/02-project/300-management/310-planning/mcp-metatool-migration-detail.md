---
title: MCP メタツール移行 詳細実装計画
description: Supabase Edge → Vercel 移行の詳細手順
created: 2026-01-07
status: 計画中
parent: mcp-metatool-implementation.md
---

# MCP メタツール移行 詳細実装計画

## 概要

本ドキュメントは [mcp-metatool-implementation.md](./mcp-metatool-implementation.md) の詳細実装計画。

**移行元**: `supabase/functions/personal-context/`（Deno）
**移行先**: `packages/console/src/app/api/mcp/`（Next.js API Routes, TypeScript）

### 環境変数

| 変数名 | 用途 |
|--------|------|
| `SUPABASE_URL` | Supabase プロジェクト URL |
| `SUPABASE_ANON_KEY` | Supabase 匿名キー（RLS で認証） |
| `SUPABASE_SERVICE_ROLE_KEY` | 管理者/テスト用認証（任意） |

### スコープ外

- データ移行（データを走査しないため不要）
- CI/CD 設定（実装完了後に対応）
- 監視・ロギング（実装完了後に対応）

---

## 現状分析

### 現行ファイル構成

```
supabase/functions/personal-context/
├── index.ts                    # エントリーポイント
├── app.ts                      # Hono アプリケーション
├── mcp/
│   ├── protocol.ts             # MCP プロトコルハンドラ
│   └── types.ts                # 型定義
├── middleware/
│   └── auth.ts                 # 認証ミドルウェア
└── tools/
    ├── rag/                    # 9 ツール
    │   ├── tools.ts
    │   ├── embedder.ts
    │   └── repository.ts
    ├── supabase/               # 19 ツール
    │   └── tools.ts
    ├── notion/                 # 16 ツール
    │   └── tools.ts
    ├── google-calendar/        # 12 ツール
    │   ├── tools.ts
    │   └── client.ts
    ├── atlassian/              # 25 ツール
    │   └── tools.ts
    ├── github/                 # 23 ツール
    │   └── tools.ts
    └── microsoft-todo/         # 14 ツール
        └── tools.ts
```

### モジュール別ツール数

| モジュール | ツール数 | 依存ファイル | 備考 |
|------------|----------|--------------|------|
| rag | 9 | embedder.ts, repository.ts | Voyage AI 埋め込み |
| supabase | 19 | - | DB/Auth/Storage 操作 |
| notion | 16 | - | Notion API |
| google_calendar | 12 | client.ts | Google Calendar API |
| atlassian | 25 | - | Jira + Confluence |
| github | 23 | - | GitHub API |
| microsoft_todo | 14 | - | MS Graph API |
| **合計** | **118** | | |

---

## 移行先ディレクトリ構成

```
packages/console/src/app/api/mcp/
├── route.ts                    # MCP エンドポイント（POST/GET/DELETE）
├── lib/
│   ├── protocol.ts             # MCP プロトコルハンドラ（メタツール対応）
│   ├── types.ts                # 型定義
│   ├── auth.ts                 # 認証処理
│   └── cache.ts                # スキーマキャッシュ
└── modules/
    ├── registry.ts             # モジュールレジストリ
    ├── rag/
    │   ├── schema.ts           # ツール定義
    │   ├── handler.ts          # ハンドラ実装
    │   ├── embedder.ts         # Voyage AI
    │   └── repository.ts       # DB クエリ
    ├── supabase/
    │   ├── schema.ts
    │   └── handler.ts
    ├── notion/
    │   ├── schema.ts
    │   └── handler.ts
    ├── google-calendar/
    │   ├── schema.ts
    │   ├── handler.ts
    │   └── client.ts
    ├── atlassian/
    │   ├── schema.ts
    │   └── handler.ts
    ├── github/
    │   ├── schema.ts
    │   └── handler.ts
    └── microsoft-todo/
        ├── schema.ts
        └── handler.ts
```

---

## 実装タスク詳細

### Phase 1: インフラ・コア実装

#### Task 1.1: 型定義の移植

**移行元**: `supabase/functions/personal-context/mcp/types.ts`

```typescript
// packages/console/src/app/api/mcp/lib/types.ts

export interface McpRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: McpError;
}

export interface McpError {
  code: number;
  message: string;
  data?: unknown;
}

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolHandler {
  (params: Record<string, unknown>, userId: string): Promise<McpToolResult>;
}

export interface ModuleDefinition {
  name: string;
  description: string;
  tools: ToolDefinition[];
  handlers: Record<string, ToolHandler>;
}

export const MCP_ERROR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;
```

**変更点**: `ToolDefinition` から `handler` を分離し、`ModuleDefinition` を追加。

---

#### Task 1.2: キャッシュ実装

```typescript
// packages/console/src/app/api/mcp/lib/cache.ts

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

export const schemaCache = new MemoryCache();

// TTL 定義
export const CACHE_TTL = {
  SCHEMA: 24 * 60 * 60 * 1000,      // 24時間
  USER_SETTINGS: 5 * 60 * 1000,     // 5分
} as const;
```

---

#### Task 1.3: 認証処理

MCP リクエストの認証は Authorization ヘッダーの Bearer トークンを検証する。
Vault アクセスは既存の `@/lib/vault.ts` を流用する。

```typescript
// packages/console/src/app/api/mcp/lib/auth.ts

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export interface AuthResult {
  userId: string | null;
  error: string | null;
}

export async function authenticateRequest(req: NextRequest): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return { userId: null, error: "Missing or invalid Authorization header" };
  }

  const token = authHeader.substring(7);

  // 1. Service Role Key チェック（管理者/テスト用）
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey && token === serviceRoleKey) {
    return { userId: "service-role", error: null };
  }

  // 2. ユーザートークン検証（OAuth 2.1）
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { userId: null, error: error?.message || "Invalid token" };
  }

  return { userId: user.id, error: null };
}

export function createUnauthorizedResponse(): Response {
  // 新エンドポイント用の .well-known を指す
  const resourceMetadataUrl = `${process.env.NEXT_PUBLIC_VERCEL_URL || "https://dwhbi-console.vercel.app"}/api/mcp/.well-known/oauth-protected-resource`;

  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
    },
  });
}
```

#### Task 1.4: Vault 連携（既存 vault.ts の拡張）

`packages/console/src/lib/vault.ts` に `microsoft_todo` サービスを追加:

```typescript
// 追加するサービス
export const SERVICES = [
  // ... 既存
  "microsoft_todo",  // 追加
] as const;

// 表示名
export const SERVICE_DISPLAY_NAMES: Record<ServiceName, string> = {
  // ... 既存
  microsoft_todo: "Microsoft To Do",
};

// 認証タイプ
export const SERVICE_AUTH_TYPES: Record<ServiceName, "api_key" | "oauth"> = {
  // ... 既存
  microsoft_todo: "oauth",
};
```

**MCP モジュールから vault.ts を利用する例:**

```typescript
// packages/console/src/app/api/mcp/modules/github/handler.ts

import { getGitHubMcpConfig } from "@/lib/vault";
import { McpToolResult } from "../../lib/types";

export async function getUser(): Promise<McpToolResult> {
  const config = await getGitHubMcpConfig();
  if (!config) {
    return {
      content: [{ type: "text", text: "GitHub PAT not configured. Set it in Console." }],
      isError: true,
    };
  }

  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${config.pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  const data = await res.json();
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
```

**各モジュールの vault 関数マッピング:**

| モジュール | vault.ts 関数 | サービス名 |
|------------|---------------|------------|
| github | `getGitHubMcpConfig()` | `github_mcp` |
| google_calendar | `getServiceCredentials("google_calendar")` | `google_calendar` |
| microsoft_todo | `getServiceCredentials("microsoft_todo")` | `microsoft_todo` |
| notion | `getNotionConfig()` | `notion` |
| atlassian | `getAtlassianConfig()` | `atlassian` |
| rag | `getVoyageConfig()` | `voyage` |
| supabase | 不要（RLS で認証済み） | - |

---

#### Task 1.5: メタツール実装

```typescript
// packages/console/src/app/api/mcp/lib/protocol.ts

import { McpRequest, McpResponse, MCP_ERROR, McpToolResult } from "./types";
import { schemaCache, CACHE_TTL } from "./cache";
import { moduleRegistry } from "../modules/registry";

// メタツール定義（常に返す 2 つのみ）
const META_TOOLS = [
  {
    name: "get_module_schema",
    description: "モジュールのツール定義を取得。",
    inputSchema: {
      type: "object",
      properties: {
        module: {
          type: "string",
          description: "モジュール名（github, atlassian, google_calendar, microsoft_todo, notion, rag, supabase）",
        },
      },
      required: ["module"],
    },
  },
  {
    name: "call_module_tool",
    description: `モジュールのツールを呼び出す。

【利用可能モジュール】
- github: リポジトリ、Issue、PR 操作
- atlassian: Jira、Confluence 操作
- google_calendar: 予定の取得・作成
- microsoft_todo: タスク管理
- notion: ページ・データベース操作
- rag: ドキュメント検索
- supabase: DB 操作

【使い方】
1. get_module_schema(module) でツール一覧とパラメータを確認
2. call_module_tool(module, tool_name, params) で実行`,
    inputSchema: {
      type: "object",
      properties: {
        module: { type: "string", description: "モジュール名" },
        tool_name: { type: "string", description: "ツール名" },
        params: { type: "object", description: "ツールパラメータ" },
      },
      required: ["module", "tool_name"],
    },
  },
];

export async function processRequest(
  request: McpRequest,
  userId: string
): Promise<McpResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case "initialize":
        return handleInitialize(id, params);

      case "tools/list":
        // メタツールのみ返す（118 ツール → 2 ツール）
        return createResponse(id, { tools: META_TOOLS });

      case "resources/list":
        return createResponse(id, { resources: [] });

      case "prompts/list":
        return createResponse(id, { prompts: [] });

      case "tools/call":
        return await handleToolCall(id, params as ToolCallParams, userId);

      case "ping":
        return createResponse(id, {});

      case "notifications/initialized":
        return createResponse(id, {});

      default:
        return createErrorResponse(id, MCP_ERROR.METHOD_NOT_FOUND, `Unknown method: ${method}`);
    }
  } catch (error) {
    console.error("Protocol error:", error);
    return createErrorResponse(
      id,
      MCP_ERROR.INTERNAL_ERROR,
      error instanceof Error ? error.message : "Internal error"
    );
  }
}

interface ToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

async function handleToolCall(
  id: string | number,
  params: ToolCallParams,
  userId: string
): Promise<McpResponse> {
  const { name, arguments: args } = params;

  switch (name) {
    case "get_module_schema":
      return handleGetModuleSchema(id, args.module as string);

    case "call_module_tool":
      return handleCallModuleTool(id, args, userId);

    default:
      return createErrorResponse(id, MCP_ERROR.METHOD_NOT_FOUND, `Unknown tool: ${name}`);
  }
}

function handleGetModuleSchema(id: string | number, moduleName: string): McpResponse {
  // キャッシュチェック
  const cacheKey = `schema:${moduleName}`;
  const cached = schemaCache.get<McpToolResult>(cacheKey);
  if (cached) {
    return createResponse(id, cached);
  }

  const module = moduleRegistry[moduleName];
  if (!module) {
    return createResponse(id, {
      content: [{ type: "text", text: `Unknown module: ${moduleName}` }],
      isError: true,
    });
  }

  const result: McpToolResult = {
    content: [{
      type: "text",
      text: JSON.stringify({
        module: moduleName,
        description: module.description,
        tools: module.tools,
      }, null, 2),
    }],
  };

  // キャッシュに保存
  schemaCache.set(cacheKey, result, CACHE_TTL.SCHEMA);

  return createResponse(id, result);
}

async function handleCallModuleTool(
  id: string | number,
  args: Record<string, unknown>,
  userId: string
): Promise<McpResponse> {
  const { module: moduleName, tool_name, params = {} } = args as {
    module: string;
    tool_name: string;
    params?: Record<string, unknown>;
  };

  const module = moduleRegistry[moduleName];
  if (!module) {
    return createResponse(id, {
      content: [{ type: "text", text: `Unknown module: ${moduleName}` }],
      isError: true,
    });
  }

  const handler = module.handlers[tool_name];
  if (!handler) {
    return createResponse(id, {
      content: [{ type: "text", text: `Unknown tool: ${tool_name} in module ${moduleName}` }],
      isError: true,
    });
  }

  try {
    const result = await handler(params, userId);
    return createResponse(id, result);
  } catch (error) {
    console.error(`Tool ${moduleName}/${tool_name} error:`, error);
    return createResponse(id, {
      content: [{
        type: "text",
        text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      }],
      isError: true,
    });
  }
}

function handleInitialize(
  id: string | number,
  params: Record<string, unknown> | undefined
): McpResponse {
  const clientVersion = (params as { protocolVersion?: string })?.protocolVersion;
  const supportedVersions = ["2024-11-05", "2025-03-26"];
  const negotiatedVersion = clientVersion && supportedVersions.includes(clientVersion)
    ? clientVersion
    : "2024-11-05";

  return createResponse(id, {
    protocolVersion: negotiatedVersion,
    capabilities: { tools: {} },
    serverInfo: { name: "personal-context", version: "2.0.0" },
  });
}

function createResponse(id: string | number, result: unknown): McpResponse {
  return { jsonrpc: "2.0", id, result };
}

function createErrorResponse(id: string | number, code: number, message: string): McpResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
```

---

#### Task 1.6: Next.js API Route

```typescript
// packages/console/src/app/api/mcp/route.ts

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, createUnauthorizedResponse } from "./lib/auth";
import { processRequest } from "./lib/protocol";
import { McpRequest } from "./lib/types";

const MCP_SESSION_HEADER = "mcp-session-id";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  // SSE stream（必要に応じて実装）
  const accept = req.headers.get("accept") || "";
  if (accept.includes("text/event-stream")) {
    return handleSseStream(req);
  }
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function DELETE() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  // 認証
  const { userId, error } = await authenticateRequest(req);
  if (!userId) {
    return createUnauthorizedResponse();
  }

  const accept = req.headers.get("accept") || "";
  const sessionId = req.headers.get(MCP_SESSION_HEADER);

  // SSE response
  if (accept.includes("text/event-stream")) {
    return handleSseRequest(req, userId, sessionId);
  }

  // JSON-RPC response
  return handleJsonRpcRequest(req, userId, sessionId);
}

async function handleJsonRpcRequest(
  req: NextRequest,
  userId: string,
  sessionId: string | null
): Promise<Response> {
  const body = await req.json() as McpRequest | McpRequest[];

  const headers: Record<string, string> = {
    ...corsHeaders,
    "Content-Type": "application/json",
  };

  if (sessionId) {
    headers[MCP_SESSION_HEADER] = sessionId;
  }

  // Batch request
  if (Array.isArray(body)) {
    const responses = await Promise.all(
      body.map((request) => processRequest(request, userId))
    );
    return NextResponse.json(responses, { headers });
  }

  // Notification (no id)
  if (!body.id) {
    await processRequest(body, userId);
    return new Response(null, { status: 202, headers });
  }

  const response = await processRequest(body, userId);
  return NextResponse.json(response, { headers });
}

async function handleSseRequest(
  req: NextRequest,
  userId: string,
  sessionId: string | null
): Promise<Response> {
  const body = await req.json() as McpRequest;

  const headers: Record<string, string> = {
    ...corsHeaders,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };

  if (sessionId) {
    headers[MCP_SESSION_HEADER] = sessionId;
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await processRequest(body, userId);
        const data = `data: ${JSON.stringify(response)}\n\n`;
        controller.enqueue(new TextEncoder().encode(data));
      } catch (error) {
        const errorData = `data: ${JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : "Unknown error",
          },
        })}\n\n`;
        controller.enqueue(new TextEncoder().encode(errorData));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers });
}

function handleSseStream(req: NextRequest): Response {
  const sessionId = req.headers.get(MCP_SESSION_HEADER);

  const headers: Record<string, string> = {
    ...corsHeaders,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };

  if (sessionId) {
    headers[MCP_SESSION_HEADER] = sessionId;
  }

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(": keep-alive\n\n"));
    },
  });

  return new Response(stream, { headers });
}
```

---

### Phase 2: モジュール移植

#### Task 2.1: モジュールレジストリ

```typescript
// packages/console/src/app/api/mcp/modules/registry.ts

import { ModuleDefinition } from "../lib/types";
import { ragModule } from "./rag/schema";
import { supabaseModule } from "./supabase/schema";
import { notionModule } from "./notion/schema";
import { googleCalendarModule } from "./google-calendar/schema";
import { atlassianModule } from "./atlassian/schema";
import { githubModule } from "./github/schema";
import { microsoftTodoModule } from "./microsoft-todo/schema";

export const moduleRegistry: Record<string, ModuleDefinition> = {
  rag: ragModule,
  supabase: supabaseModule,
  notion: notionModule,
  google_calendar: googleCalendarModule,
  atlassian: atlassianModule,
  github: githubModule,
  microsoft_todo: microsoftTodoModule,
};
```

---

#### Task 2.2: モジュール移植パターン（GitHub を例に）

**移行元**: `supabase/functions/personal-context/tools/github/tools.ts`

**変更点**:
1. `Deno.env.get()` → `process.env`
2. ファイル拡張子 `.ts` を import から削除
3. `ToolDefinition[]` から `ModuleDefinition` に変換

```typescript
// packages/console/src/app/api/mcp/modules/github/schema.ts

import { ModuleDefinition, ToolDefinition, ToolHandler, McpToolResult } from "../../lib/types";
import * as handlers from "./handler";

const tools: ToolDefinition[] = [
  {
    name: "github_get_user",
    description: "Get information about the authenticated GitHub user.",
    inputSchema: { type: "object", properties: {} },
  },
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
  // ... 他 21 ツール
];

const handlerMap: Record<string, ToolHandler> = {
  github_get_user: handlers.getUser,
  github_list_repos: handlers.listRepos,
  // ... 他のハンドラマッピング
};

export const githubModule: ModuleDefinition = {
  name: "github",
  description: "GitHub リポジトリ、Issue、PR の操作",
  tools,
  handlers: handlerMap,
};
```

```typescript
// packages/console/src/app/api/mcp/modules/github/handler.ts

import { McpToolResult } from "../../lib/types";
import { getGitHubMcpConfig } from "@/lib/vault";

async function getGitHubToken(): Promise<string> {
  const config = await getGitHubMcpConfig();
  if (!config?.pat) {
    throw new Error("GitHub PAT not found. Please configure in Console.");
  }
  return config.pat;
}

async function githubFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getGitHubToken();
  return fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
  });
}

export async function getUser(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const res = await githubFetch("/user");
  const data = await res.json();
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export async function listRepos(
  params: Record<string, unknown>,
  userId: string
): Promise<McpToolResult> {
  const { type = "owner", sort = "updated", perPage = 30, page = 1 } = params as {
    type?: string;
    sort?: string;
    perPage?: number;
    page?: number;
  };

  const query = new URLSearchParams({
    type,
    sort,
    per_page: String(perPage),
    page: String(page),
  });

  const res = await githubFetch(`/user/repos?${query}`);
  const data = await res.json();
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// ... 他のハンドラ
```

---

#### Task 2.3: 各モジュール移植チェックリスト

| モジュール | schema.ts | handler.ts | 依存移植 | テスト |
|------------|:---------:|:----------:|:--------:|:------:|
| rag | [ ] | [ ] | embedder.ts, repository.ts | [ ] |
| supabase | [ ] | [ ] | - | [ ] |
| notion | [ ] | [ ] | - | [ ] |
| google_calendar | [ ] | [ ] | client.ts | [ ] |
| atlassian | [ ] | [ ] | - | [ ] |
| github | [ ] | [ ] | - | [ ] |
| microsoft_todo | [ ] | [ ] | - | [ ] |

---

### Phase 3: 動作検証

#### Task 3.1: ローカルテスト

```bash
# 開発サーバー起動
cd packages/console
npm run dev

# Service Role Key でエンドポイント動作確認
# （本番では OAuth 2.1 を使用）

# ツール一覧取得（メタツールのみ返ることを確認）
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# スキーマ取得
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_module_schema","arguments":{"module":"github"}}}'

# ツール呼び出し
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"call_module_tool","arguments":{"module":"github","tool_name":"github_get_user","params":{}}}}'
```

#### Task 3.2: Claude での E2E テスト

1. MCP 設定を Vercel エンドポイントに変更
2. 以下のシナリオをテスト:
   - `GitHub のリポジトリを見せて` → get_module_schema → call_module_tool の流れ
   - 複数モジュールの連続利用
   - エラーケース（無効なモジュール名、トークン未設定）

#### Task 3.3: パフォーマンス計測

| 指標 | 目標 | 計測方法 |
|------|------|----------|
| tools/list レスポンス時間 | < 100ms | curl + time |
| get_module_schema レスポンス時間 | < 200ms（初回）, < 50ms（キャッシュヒット） | curl + time |
| call_module_tool レスポンス時間 | < 10s（Vercel 制限内） | curl + time |
| トークン消費 | 初期 ~300 トークン | Claude コンテキスト表示 |

---

## Deno → TypeScript 変換パターン

### 環境変数

```typescript
// Before (Deno)
const key = Deno.env.get("SUPABASE_URL");

// After (Node.js)
const key = process.env.SUPABASE_URL;
```

### import 文

```typescript
// Before (Deno)
import { foo } from "./bar.ts";

// After (Node.js)
import { foo } from "./bar";
```

### fetch API

変更不要（Node.js 18+ でネイティブサポート）

### TextEncoder/ReadableStream

変更不要（Web API 互換）

---

## リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| Vercel 10s タイムアウト | 長時間クエリが失敗 | 各ツールで処理時間を監視、問題があれば分割 |
| メモリキャッシュのコールドスタート | 初回リクエストが遅い | スキーマは軽量なため影響軽微 |
| OAuth トークン更新 | トークン期限切れで認証失敗 | 既存の client.ts のリフレッシュロジックを流用 |

## ロールバック計画

### 並行運用フェーズ

```
[Phase 1] 現在
  MCP Client → Supabase Edge Functions (personal-context)

[Phase 2] 移行テスト
  MCP Client → Vercel /api/mcp ← テスト環境
  MCP Client → Supabase Edge Functions ← 本番

[Phase 3] 本番切り替え
  MCP Client → Vercel /api/mcp ← 本番
  Supabase Edge Functions ← 残す（ロールバック用）

[Phase 4] 安定後
  Supabase Edge Functions を削除
```

### MCP クライアント設定の切り替え

```jsonc
// 旧 (Supabase)
{
  "mcpServers": {
    "personal-context": {
      "url": "https://<project>.supabase.co/functions/v1/personal-context"
    }
  }
}

// 新 (Vercel)
{
  "mcpServers": {
    "personal-context": {
      "url": "https://dwhbi-console.vercel.app/api/mcp"
    }
  }
}
```

## OAuth / Consent Screen

新エンドポイント専用の `.well-known` を新規作成。既存エンドポイントは変更不要。

### ディレクトリ構成

```
packages/console/src/app/
├── .well-known/
│   └── oauth-protected-resource/
│       └── route.ts                    # 既存（旧エンドポイント用）変更不要
└── api/
    └── mcp/
        ├── route.ts                    # MCP エンドポイント
        └── .well-known/
            └── oauth-protected-resource/
                └── route.ts            # 新規作成（新エンドポイント用）
```

### URL マッピング

| エンドポイント | .well-known URL |
|----------------|-----------------|
| 旧: `supabase.../functions/v1/personal-context` | `https://dwhbi-console.vercel.app/.well-known/oauth-protected-resource` |
| 新: `https://dwhbi-console.vercel.app/api/mcp` | `https://dwhbi-console.vercel.app/api/mcp/.well-known/oauth-protected-resource` |

### 新規作成ファイル

```typescript
// packages/console/src/app/api/mcp/.well-known/oauth-protected-resource/route.ts

import { NextResponse } from "next/server";

export async function GET() {
  const metadata = {
    resource: "https://dwhbi-console.vercel.app/api/mcp",
    authorization_servers: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
    scopes_supported: ["openid", "profile", "email"],
    bearer_methods_supported: ["header"],
  };

  return NextResponse.json(metadata, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
```

### 既存ファイル

`packages/console/src/app/.well-known/oauth-protected-resource/route.ts` は **変更不要**。
旧エンドポイント（Supabase Edge Functions）が引き続き使用。

---

## 完了条件

- [ ] メタツール 2 つのみが tools/list で返る
- [ ] 全 7 モジュールが get_module_schema で取得可能
- [ ] 全 118 ツールが call_module_tool で実行可能
- [ ] Claude での 2 ステップ動作を確認
- [ ] キャッシュが機能している（2 回目の get_module_schema が高速）
- [ ] ローカル・本番で OAuth 認証が機能

---

*作成日: 2026-01-07*
