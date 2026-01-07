// packages/console/src/app/api/mcp/lib/auth.ts

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export interface AuthResult {
  userId: string | null;
  error: string | null;
}

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

export async function authenticateRequest(
  req: NextRequest
): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return { userId: null, error: "Missing or invalid Authorization header" };
  }

  const token = authHeader.substring(7);

  // 1. Service Role Key チェック（管理者/テスト用）
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey && token === serviceRoleKey) {
    // X-User-Id ヘッダーがあれば、そのユーザーとして実行（テスト/管理用）
    const overrideUserId = req.headers.get("X-User-Id");
    return { userId: overrideUserId || "service-role", error: null };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return { userId: null, error: "Supabase configuration missing" };
  }

  // 2. MCPトークン検証（長期有効トークン）
  // MCPトークンは64文字のhex形式 (UUID+UUID without hyphens)
  if (token.length === 64 && /^[a-f0-9]+$/i.test(token)) {
    const tokenHash = await sha256(token);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase.rpc("validate_mcp_token", {
      p_token_hash: tokenHash,
    });

    if (!error && data && data.length > 0 && data[0].is_valid) {
      // last_used_at を更新（非同期、エラー無視）
      supabase.rpc("update_mcp_token_last_used", {
        p_token_id: data[0].token_id,
      }).then(() => {});

      return { userId: data[0].user_id, error: null };
    }

    // MCPトークン形式だが無効な場合はエラー
    if (data && data.length > 0 && !data[0].is_valid) {
      return { userId: null, error: "Token expired or revoked" };
    }
  }

  // 3. Supabase Authトークン検証（OAuth 2.1）
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseAnonKey) {
    return { userId: null, error: "Supabase anon key missing" };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

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
