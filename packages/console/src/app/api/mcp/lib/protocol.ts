// packages/console/src/app/api/mcp/lib/protocol.ts

import {
  McpRequest,
  McpResponse,
  MCP_ERROR,
  McpToolResult,
} from "./types";
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
          description:
            "モジュール名（google_calendar, microsoft_todo, notion）",
        },
      },
      required: ["module"],
    },
  },
  {
    name: "call_module_tool",
    description: `モジュールのツールを呼び出す。

【利用可能モジュール】
- google_calendar: 予定の取得・作成
- microsoft_todo: タスク管理
- notion: ページ・データベース操作

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
        return await handleToolCall(id, params as unknown as ToolCallParams, userId);

      case "ping":
        return createResponse(id, {});

      case "notifications/initialized":
        return createResponse(id, {});

      default:
        return createErrorResponse(
          id,
          MCP_ERROR.METHOD_NOT_FOUND,
          `Unknown method: ${method}`
        );
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
      return createErrorResponse(
        id,
        MCP_ERROR.METHOD_NOT_FOUND,
        `Unknown tool: ${name}`
      );
  }
}

function handleGetModuleSchema(
  id: string | number,
  moduleName: string
): McpResponse {
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
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            module: moduleName,
            description: module.description,
            tools: module.tools,
          },
          null,
          2
        ),
      },
    ],
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
  const {
    module: moduleName,
    tool_name,
    params = {},
  } = args as {
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
      content: [
        {
          type: "text",
          text: `Unknown tool: ${tool_name} in module ${moduleName}`,
        },
      ],
      isError: true,
    });
  }

  try {
    const result = await handler(params, userId);
    return createResponse(id, result);
  } catch (error) {
    console.error(`Tool ${moduleName}/${tool_name} error:`, error);
    return createResponse(id, {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    });
  }
}

function handleInitialize(
  id: string | number,
  params: Record<string, unknown> | undefined
): McpResponse {
  const clientVersion = (params as { protocolVersion?: string })
    ?.protocolVersion;
  const supportedVersions = ["2024-11-05", "2025-03-26"];
  const negotiatedVersion =
    clientVersion && supportedVersions.includes(clientVersion)
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

function createErrorResponse(
  id: string | number,
  code: number,
  message: string
): McpResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
