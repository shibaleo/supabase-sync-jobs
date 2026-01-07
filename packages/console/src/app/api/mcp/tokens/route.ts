// packages/console/src/app/api/mcp/tokens/route.ts
//
// MCP Token Management API
// - GET: List user's tokens
// - POST: Create new token
// - DELETE: Revoke token

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

/**
 * SHA-256ハッシュを生成
 */
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 64文字のランダムトークンを生成 (UUID + UUID without hyphens)
 */
function generateToken(): string {
  const uuid1 = crypto.randomUUID().replace(/-/g, "");
  const uuid2 = crypto.randomUUID().replace(/-/g, "");
  return uuid1 + uuid2;
}

/**
 * Supabase Authでユーザーを認証
 */
async function authenticateUser(req: NextRequest): Promise<{ userId: string | null; error: string | null }> {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return { userId: null, error: "Missing or invalid Authorization header" };
  }

  const token = authHeader.substring(7);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { userId: null, error: "Supabase configuration missing" };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { userId: null, error: error?.message || "Invalid token" };
  }

  return { userId: user.id, error: null };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * GET /api/mcp/tokens - List user's tokens
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await authenticateUser(req);

  if (!userId) {
    return NextResponse.json(
      { error: authError || "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500, headers: corsHeaders }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from("mcp_tokens")
    .select("id, name, created_at, expires_at, last_used_at, revoked_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }

  return NextResponse.json(
    {
      tokens: data.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.created_at,
        expiresAt: t.expires_at,
        lastUsedAt: t.last_used_at,
        isRevoked: !!t.revoked_at,
        isExpired: t.expires_at ? new Date(t.expires_at) < new Date() : false,
      })),
    },
    { headers: corsHeaders }
  );
}

/**
 * POST /api/mcp/tokens - Create new token
 * Body: { name: string, expiresInDays?: number }
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await authenticateUser(req);

  if (!userId) {
    return NextResponse.json(
      { error: authError || "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  let body: { name?: string; expiresInDays?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders }
    );
  }

  const name = body.name || "Unnamed Token";
  const expiresInDays = body.expiresInDays;

  // トークン生成
  const token = generateToken();
  const tokenHash = await sha256(token);

  // 有効期限計算
  let expiresAt: string | null = null;
  if (expiresInDays && expiresInDays > 0) {
    const date = new Date();
    date.setDate(date.getDate() + expiresInDays);
    expiresAt = date.toISOString();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500, headers: corsHeaders }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from("mcp_tokens")
    .insert({
      user_id: userId,
      token_hash: tokenHash,
      name,
      expires_at: expiresAt,
    })
    .select("id, name, created_at, expires_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }

  // トークンは一度だけ返す（再取得不可）
  return NextResponse.json(
    {
      token, // WARNING: This is shown only once!
      id: data.id,
      name: data.name,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
    },
    { status: 201, headers: corsHeaders }
  );
}

/**
 * DELETE /api/mcp/tokens?id={tokenId} - Revoke token
 */
export async function DELETE(req: NextRequest) {
  const { userId, error: authError } = await authenticateUser(req);

  if (!userId) {
    return NextResponse.json(
      { error: authError || "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  const tokenId = req.nextUrl.searchParams.get("id");

  if (!tokenId) {
    return NextResponse.json(
      { error: "Missing token id" },
      { status: 400, headers: corsHeaders }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500, headers: corsHeaders }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // ユーザーの所有するトークンのみ無効化可能
  const { data, error } = await supabase
    .from("mcp_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("user_id", userId)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Token not found" },
      { status: 404, headers: corsHeaders }
    );
  }

  return NextResponse.json(
    { revoked: true, id: tokenId },
    { headers: corsHeaders }
  );
}
