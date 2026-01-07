/**
 * OAuth 2.1 Authorization Server Metadata (RFC 8414)
 * Proxies to Supabase Auth's OAuth Server metadata
 */
import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

export async function GET() {
  // Fetch Supabase Auth's OAuth metadata and return it
  try {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/.well-known/openid-configuration`
    );

    if (response.ok) {
      const metadata = await response.json();
      return NextResponse.json(metadata, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  } catch (e) {
    // Fall through to manual metadata
  }

  // Fallback: manually construct metadata pointing to Supabase Auth
  const metadata = {
    issuer: `${SUPABASE_URL}/auth/v1`,
    authorization_endpoint: `${SUPABASE_URL}/auth/v1/authorize`,
    token_endpoint: `${SUPABASE_URL}/auth/v1/token`,
    registration_endpoint: `${SUPABASE_URL}/auth/v1/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["openid", "profile", "email"],
  };

  return NextResponse.json(metadata, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
