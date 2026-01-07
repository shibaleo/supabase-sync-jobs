// packages/console/src/app/api/mcp/[userId]/route.ts
//
// User-specific MCP endpoint for traffic control
// URL: /api/mcp/{userId}

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, createUnauthorizedResponse } from "../lib/auth";
import { processRequest } from "../lib/protocol";
import { McpRequest } from "../lib/types";

const MCP_SESSION_HEADER = "mcp-session-id";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

interface RouteParams {
  params: Promise<{ userId: string }>;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const accept = req.headers.get("accept") || "";
  if (accept.includes("text/event-stream")) {
    return handleSseStream(req);
  }
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function DELETE() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { userId: pathUserId } = await params;

  // 認証
  const { userId: tokenUserId, error } = await authenticateRequest(req);
  if (!tokenUserId) {
    return createUnauthorizedResponse();
  }

  // トークンのユーザーIDとパスのユーザーIDが一致するか検証
  if (tokenUserId !== pathUserId) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "User ID mismatch: token user does not match URL user",
        },
      },
      { status: 403, headers: corsHeaders }
    );
  }

  const accept = req.headers.get("accept") || "";
  const sessionId = req.headers.get(MCP_SESSION_HEADER);

  if (accept.includes("text/event-stream")) {
    return handleSseRequest(req, tokenUserId, sessionId);
  }

  return handleJsonRpcRequest(req, tokenUserId, sessionId);
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

  if (Array.isArray(body)) {
    const responses = await Promise.all(
      body.map((request) => processRequest(request, userId))
    );
    return NextResponse.json(responses, { headers });
  }

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
