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
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  // SSE stream
  const accept = req.headers.get("accept") || "";
  if (accept.includes("text/event-stream")) {
    // 認証チェック - 未認証なら401を返してOAuthフローを開始させる
    const { userId } = await authenticateRequest(req);
    if (!userId) {
      return createUnauthorizedResponse();
    }
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
  const body = (await req.json()) as McpRequest | McpRequest[];

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
  const body = (await req.json()) as McpRequest;

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
