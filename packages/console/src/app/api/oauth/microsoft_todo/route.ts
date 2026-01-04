import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceCredentials } from "@/lib/vault";

// Microsoft OAuth2 設定
const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const SCOPES = "Tasks.ReadWrite offline_access";

function getRedirectUri() {
  // 本番URLが設定されている場合はそれを使用（最優先）
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/microsoft_todo/callback`;
  }
  // ローカル開発環境
  return "http://localhost:3000/api/oauth/microsoft_todo/callback";
}

// OAuth認証開始 - 認証URLを返す
export async function GET() {
  // 認証チェック
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Vaultからclient_idを取得
    const credentials = await getServiceCredentials("microsoft_todo");

    if (!credentials || !credentials.client_id) {
      return NextResponse.json(
        { error: "Client ID not configured. Please save Client ID first." },
        { status: 400 }
      );
    }

    const params = new URLSearchParams({
      client_id: credentials.client_id as string,
      redirect_uri: getRedirectUri(),
      response_type: "code",
      scope: SCOPES,
      response_mode: "query",
    });

    const authUrl = `${MS_AUTH_URL}?${params.toString()}`;

    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error("Failed to generate auth URL:", error);
    return NextResponse.json(
      { error: "Failed to generate auth URL" },
      { status: 500 }
    );
  }
}
