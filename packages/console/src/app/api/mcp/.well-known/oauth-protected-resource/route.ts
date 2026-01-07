// packages/console/src/app/api/mcp/.well-known/oauth-protected-resource/route.ts
//
// OAuth 2.0 Protected Resource Metadata (RFC 8707)
// Points to Supabase Auth as the authorization server

import { NextResponse } from "next/server";

const BASE_URL = process.env.NEXT_PUBLIC_VERCEL_URL
  ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
  : "http://localhost:3000";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

export async function GET() {
  const metadata = {
    resource: `${BASE_URL}/api/mcp`,
    authorization_servers: [
      `${SUPABASE_URL}/auth/v1`, // Supabase OAuth Server
    ],
    scopes_supported: ["openid", "profile", "email"],
    bearer_methods_supported: ["header"],
  };

  return NextResponse.json(metadata, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
