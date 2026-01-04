import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAtlassianConfig, saveAtlassianConfig, deleteAtlassianConfig } from "@/lib/vault";

function maskApiToken(token: string): string {
  if (token.length <= 12) return "****";
  return token.slice(0, 4) + "****" + token.slice(-4);
}

/**
 * Atlassian API Tokenの有効性を確認（Jira APIで検証）
 */
async function validateAtlassianCredentials(
  email: string,
  apiToken: string,
  domain: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Basic Auth: email:api_token
    const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");

    // /rest/api/3/myself エンドポイントでトークンを検証
    const res = await fetch(`https://${domain}/rest/api/3/myself`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    if (res.status === 401) {
      return { valid: false, error: "認証情報が無効です" };
    }

    if (res.status === 404) {
      return { valid: false, error: "ドメインが正しくありません" };
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        valid: false,
        error: data.errorMessages?.[0] || "APIエラーが発生しました",
      };
    }

    return { valid: true };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return { valid: false, error: "ドメインに接続できません" };
    }
    return { valid: false, error: "検証中にエラーが発生しました" };
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await getAtlassianConfig();

    if (!config) {
      return NextResponse.json({ configured: false });
    }

    return NextResponse.json({
      configured: true,
      email: config.email,
      api_token: maskApiToken(config.api_token),
      domain: config.domain,
    });
  } catch (error) {
    console.error("Failed to get Atlassian config:", error);
    return NextResponse.json(
      { error: "Failed to get Atlassian config" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { email, api_token, domain } = body;

    if (!email || !api_token || !domain) {
      return NextResponse.json(
        { error: "Email, API token, and domain are required" },
        { status: 400 }
      );
    }

    // ドメインを正規化（https:// を削除）
    const normalizedDomain = domain
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");

    // 認証情報の有効性を検証
    const validation = await validateAtlassianCredentials(
      email,
      api_token,
      normalizedDomain
    );
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    await saveAtlassianConfig({
      email,
      api_token,
      domain: normalizedDomain,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save Atlassian config:", error);
    return NextResponse.json(
      { error: "Failed to save Atlassian config" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await deleteAtlassianConfig();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete Atlassian config:", error);
    return NextResponse.json(
      { error: "Failed to delete Atlassian config" },
      { status: 500 }
    );
  }
}
