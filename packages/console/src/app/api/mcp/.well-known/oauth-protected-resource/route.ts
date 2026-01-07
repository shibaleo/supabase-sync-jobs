// packages/console/src/app/api/mcp/.well-known/oauth-protected-resource/route.ts

import { NextResponse } from "next/server";

export async function GET() {
  const metadata = {
    resource: "https://dwhbi-console.vercel.app/api/mcp",
    authorization_servers: [
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`,
    ],
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
