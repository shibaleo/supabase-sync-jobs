// packages/console/src/app/api/mcp/lib/auth.ts

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export interface AuthResult {
  userId: string | null;
  error: string | null;
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
    return { userId: "service-role", error: null };
  }

  // 2. ユーザートークン検証（OAuth 2.1）
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

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
