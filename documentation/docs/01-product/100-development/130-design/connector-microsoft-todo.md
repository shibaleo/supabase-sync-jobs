---
title: Microsoft To Do コネクタ設計
description: Microsoft Graph API (To Do) との連携設計
---

# Microsoft To Do コネクタ設計

## 概要

Microsoft Graph API から To Do データを取得し、PostgreSQL raw 層に保存するコネクタ。

| 項目 | 値 |
|------|-----|
| パッケージ | `@repo/connector/microsoft-todo` |
| 認証方式 | OAuth 2.0 (Refresh Token) |
| API バージョン | Microsoft Graph API v1.0 |
| 認証情報保存 | PostgreSQL Vault (`vault.secrets`) |

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                      cli.ts                                  │
│                    (エントリポイント)                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    orchestrator.ts                           │
│                   (同期オーケストレーター)                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ getDbClient() → syncLists() → syncTasks() → closeDb()  ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
┌─────────▼──────────┐          ┌────────▼─────────┐
│  sync-lists.ts     │          │  sync-tasks.ts   │
│  (リスト同期)       │          │  (タスク同期)     │
└─────────┬──────────┘          └────────┬─────────┘
          │                               │
          └───────────────┬───────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    api-client.ts                             │
│                   (API通信・OAuth)                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ getAuthInfo() - トークン自動リフレッシュ                  ││
│  │ fetchLists(), fetchTasks()                              ││
│  │ requestWithRetry() - レートリミット対応                   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                  credentials-vault.ts                        │
│                 (Vault 認証情報管理)                         │
└─────────────────────────────────────────────────────────────┘
```

## データフロー

### 同期処理フロー

```
1. CLI起動
2. DB接続確立 (getDbClient)
3. 認証情報取得・トークンリフレッシュ（必要に応じて）
4. データ同期
   - lists (タスクリスト一覧)
   - tasks (各リストのタスク一覧)
5. DB接続クローズ (closeDbClient)
```

### 認証フロー

```
1. getAuthInfo() 呼び出し
2. キャッシュ確認 (有効期限60分以上なら返却)
3. Vault から認証情報取得
4. トークン有効期限チェック
   - 有効期限切れまたは60分以内 → リフレッシュ
5. リフレッシュ実行
   - Microsoft OAuth endpoint に refresh_token 送信
   - 新しい access_token 取得
   - Vault 更新 (access_token, refresh_token, _expires_at)
6. キャッシュに保存
```

## API エンドポイント

### Microsoft Graph API v1.0

| エンドポイント | メソッド | 用途 |
|--------------|---------|------|
| `/me/todo/lists` | GET | タスクリスト一覧 |
| `/me/todo/lists/{listId}/tasks` | GET | タスク一覧（リストごと） |
| `/me/todo/lists/{listId}/tasks` | POST | タスク作成 |
| `/me/todo/lists/{listId}/tasks/{taskId}` | GET | タスク詳細取得 |
| `/me/todo/lists/{listId}/tasks/{taskId}` | PATCH | タスク更新 |
| `/me/todo/lists/{listId}/tasks/{taskId}` | DELETE | タスク削除 |
| `/me/todo/lists/{listId}/tasks/{taskId}/extensions` | POST | Open Extension 作成 |
| `/me/todo/lists/{listId}/tasks/{taskId}?$expand=extensions` | GET | Extension 含めて取得 |

### OAuth

| エンドポイント | 用途 |
|--------------|------|
| `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` | 認証 |
| `https://login.microsoftonline.com/common/oauth2/v2.0/token` | トークン取得・リフレッシュ |

### 必要なスコープ

| スコープ | 用途 |
|---------|------|
| `Tasks.ReadWrite` | タスクの読み取り・作成・更新・削除 |
| `offline_access` | リフレッシュトークン取得 |

> **Note**: `Tasks.Read` は読み取り専用。MCP ツールで CRUD 操作を行うため `Tasks.ReadWrite` を使用。

### レート制限

| 制限 | 値 |
|------|-----|
| 429エラー時 | Retry-After ヘッダー参照 |
| 推奨 | 指数バックオフでリトライ |

## Open Extensions (カスタムプロパティ)

Google Calendar の ExtendedProperties と同様に、タスクにカスタムメタデータを埋め込む。

### Extension 名

```
com.dwhbi.taskMetadata
```

### プロパティ定義

| プロパティ | 型 | 説明 | 例 |
|-----------|-----|------|-----|
| `source` | string | 作成元アプリ識別子 | `"dwhbi-console"`, `"dwhbi-mcp"` |
| `gcal_event_id` | string | 関連する Google Calendar イベント ID | `"abc123xyz"` |
| `toggl_project_id` | string | 関連する Toggl Track プロジェクト ID | `"12345678"` |
| `pattern_group_id` | string | パターングループ ID | `"uuid-xxx"` |
| `registered_at` | string | 登録日時 (ISO 8601) | `"2026-01-04T10:00:00.000Z"` |
| `tags` | string | タグ (JSON 配列文字列) | `"[\"work\",\"urgent\"]"` |

### TypeScript 型定義

```typescript
export interface TaskExtension {
  "@odata.type": "microsoft.graph.openTypeExtension";
  extensionName: "com.dwhbi.taskMetadata";
  source?: string;
  gcal_event_id?: string;
  toggl_project_id?: string;
  pattern_group_id?: string;
  registered_at?: string;
  tags?: string;  // JSON.stringify(["tag1", "tag2"])
}
```

### Extension 作成例

```typescript
// タスク作成後に Extension を追加
await fetch(`https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks/${task.id}/extensions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    "@odata.type": "microsoft.graph.openTypeExtension",
    extensionName: "com.dwhbi.taskMetadata",
    source: "dwhbi-console",
    gcal_event_id: "calendar_event_123",
    registered_at: new Date().toISOString(),
    tags: JSON.stringify(["routine", "weekly"]),
  }),
});
```

### Extension 取得例

```typescript
// $expand=extensions でタスクと一緒に取得
const response = await fetch(
  `https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks/${taskId}?$expand=extensions`,
  { headers: { Authorization: `Bearer ${accessToken}` } }
);
const task = await response.json();
const metadata = task.extensions?.find(
  (ext: { extensionName: string }) => ext.extensionName === "com.dwhbi.taskMetadata"
);
```

## MCP ツール

Google Calendar と同様に、MCP ツールとして実装する。

### ディレクトリ構成

```
supabase/functions/personal-context/tools/microsoft-todo/
├── client.ts    # Microsoft Graph API クライアント（OAuth、トークンリフレッシュ）
└── tools.ts     # MCP ツール定義
```

### ツール一覧

| ツール名 | 説明 |
|---------|------|
| `mstodo_list_lists` | タスクリスト一覧取得 |
| `mstodo_list_tasks` | タスク一覧取得（リストID指定） |
| `mstodo_get_task` | タスク詳細取得 |
| `mstodo_create_task` | タスク作成 |
| `mstodo_update_task` | タスク更新 |
| `mstodo_complete_task` | タスク完了 |
| `mstodo_delete_task` | タスク削除 |

### ツール定義例

```typescript
{
  name: "mstodo_create_task",
  description: "Create a new task in Microsoft To Do.",
  inputSchema: {
    type: "object",
    properties: {
      listId: {
        type: "string",
        description: "Task list ID. Use mstodo_list_lists to find available lists.",
      },
      title: {
        type: "string",
        description: "Task title. Required.",
      },
      body: {
        type: "string",
        description: "Task body/notes.",
      },
      dueDateTime: {
        type: "string",
        description: "Due date in ISO 8601 format (e.g., '2026-01-10T10:00:00+09:00').",
      },
      importance: {
        type: "string",
        enum: ["low", "normal", "high"],
        description: "Task importance. Default is 'normal'.",
      },
      categories: {
        type: "array",
        items: { type: "string" },
        description: "Task categories/tags.",
      },
      extension: {
        type: "object",
        description: "Custom metadata (Open Extension).",
        properties: {
          source: { type: "string" },
          gcal_event_id: { type: "string" },
          toggl_project_id: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    },
    required: ["listId", "title"],
  },
}
```

## raw テーブル

### テーブル定義

| テーブル名 | source_id | 説明 |
|-----------|-----------|------|
| `raw.microsoft_todo__lists` | `{list_id}` | タスクリスト |
| `raw.microsoft_todo__tasks` | `{task_id}` | タスク |

### テーブル作成SQL

```sql
-- タスクリスト
CREATE TABLE raw.microsoft_todo__lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT NOT NULL UNIQUE,   -- list ID
    data JSONB NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    api_version TEXT DEFAULT 'v1.0'
);

CREATE INDEX idx_microsoft_todo_lists_synced_at ON raw.microsoft_todo__lists(synced_at);

-- タスク
CREATE TABLE raw.microsoft_todo__tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT NOT NULL UNIQUE,   -- task ID
    data JSONB NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    api_version TEXT DEFAULT 'v1.0'
);

CREATE INDEX idx_microsoft_todo_tasks_synced_at ON raw.microsoft_todo__tasks(synced_at);
CREATE INDEX idx_microsoft_todo_tasks_list_id ON raw.microsoft_todo__tasks((data->>'listId'));
CREATE INDEX idx_microsoft_todo_tasks_status ON raw.microsoft_todo__tasks((data->>'status'));
CREATE INDEX idx_microsoft_todo_tasks_completed ON raw.microsoft_todo__tasks((data->>'completedDateTime'));
```

### source_id 形式

| データ型 | source_id | 例 |
|---------|-----------|-----|
| リスト | list_id | `"AAMkADIyAAAAABrJAAA="` |
| タスク | task_id | `"AQMkADAwATM0MDAAMS0yMDky..."` |

### data JSONB 構造

**リスト (lists)**:

```json
{
  "id": "AAMkADIyAAAAABrJAAA=",
  "displayName": "Daily routine",
  "isOwner": true,
  "isShared": false,
  "wellknownListName": "none"
}
```

**タスク (tasks)**:

```json
{
  "id": "AQMkADAwATM0MDAAMS0yMDky...",
  "listId": "AAMkADIyAAAAABrJAAA=",
  "title": "Buy groceries",
  "body": {
    "content": "Milk, eggs, bread",
    "contentType": "text"
  },
  "status": "completed",
  "importance": "normal",
  "isReminderOn": false,
  "categories": ["Shopping"],
  "createdDateTime": "2025-01-01T09:00:00Z",
  "lastModifiedDateTime": "2025-01-02T10:30:00Z",
  "completedDateTime": {
    "dateTime": "2025-01-02T10:00:00",
    "timeZone": "Asia/Tokyo"
  },
  "dueDateTime": {
    "dateTime": "2025-01-02T12:00:00",
    "timeZone": "Asia/Tokyo"
  },
  "startDateTime": null,
  "recurrence": null,
  "hasAttachments": false,
  "_completedDateTime_utc": "2025-01-02T01:00:00.000Z",
  "_dueDateTime_utc": "2025-01-02T03:00:00.000Z"
}
```

### status 値

| status | 説明 |
|--------|------|
| `notStarted` | 未開始 |
| `inProgress` | 進行中 |
| `completed` | 完了 |
| `waitingOnOthers` | 他者待ち |
| `deferred` | 延期 |

### importance 値

| importance | 説明 |
|------------|------|
| `low` | 低 |
| `normal` | 通常 |
| `high` | 高 |

## 日時変換

Microsoft Graph API は `dateTimeTimeZone` 型で日時を返す。タイムゾーン情報を保持しつつ UTC に変換。

```typescript
interface DateTimeTimeZone {
  dateTime: string;  // "2025-01-02T10:00:00"
  timeZone: string;  // "Asia/Tokyo"
}

function convertToUtc(dt: DateTimeTimeZone | null): string | null {
  if (!dt) return null;
  // タイムゾーンを考慮して UTC に変換
  const date = new Date(`${dt.dateTime}${getUtcOffset(dt.timeZone)}`);
  return date.toISOString();
}
```

## Vault 認証情報

```json
{
  "client_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "client_secret": "xxxxx",
  "refresh_token": "xxxxx",
  "access_token": "xxxxx",
  "_auth_type": "oauth2",
  "_expires_at": "2025-01-01T11:00:00.000Z"
}
```

| フィールド | 必須 | 説明 |
|-----------|-----|------|
| `client_id` | ○ | Azure AD アプリケーション ID |
| `client_secret` | ○ | アプリケーションシークレット |
| `refresh_token` | ○ | リフレッシュトークン (更新される) |
| `access_token` | ○ | アクセストークン (自動更新) |
| `_auth_type` | ○ | `"oauth2"` 固定 |
| `_expires_at` | △ | トークン有効期限 (自動更新) |

## トークンリフレッシュ

### 自動リフレッシュ条件

- `_expires_at` が未設定
- 現在時刻から有効期限まで60分以内
- `forceRefresh = true` で呼び出し

### リフレッシュ処理

```typescript
const DEFAULT_THRESHOLD_MINUTES = 60;

const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({
    client_id,
    client_secret,
    grant_type: "refresh_token",
    refresh_token,
    scope: "Tasks.ReadWrite offline_access",
  }),
});

// トークン有効期限を計算 (expires_in は秒単位)
const expiresAt = new Date(Date.now() + response.expires_in * 1000);

// Vault 更新 (refresh_token も新しくなる可能性あり)
await updateCredentials("microsoft_todo", {
  access_token: newToken.access_token,
  refresh_token: newToken.refresh_token,
}, expiresAt);
```

## エラーハンドリング

| エラー | 対応 |
|--------|------|
| 401 Unauthorized | トークンリフレッシュ → リトライ |
| 429 Too Many Requests | Retry-After 待機 → リトライ (指数バックオフ) |
| 400 Token refresh error | リフレッシュトークン失効 → エラー終了 (再認証必要) |
| 5xx Server Error | 1秒待機 → 1回リトライ → エラー終了 |

## 使用例

### CLI

```bash
# 全データ同期
npm run sync:microsoft-todo

# 本番環境向け（ログ最小限）
npm run sync:microsoft-todo -- --log-level warn
```

### ライブラリ

```typescript
import { syncAll } from "@repo/connector/microsoft-todo";

const result = await syncAll();
console.log(result.listsCount);
console.log(result.tasksCount);
```

## ディレクトリ構成

```
packages/connector/src/services/microsoft-todo/
├── index.ts                      # Public exports
├── api-client.ts                 # API 通信・OAuth
├── orchestrator.ts               # 同期オーケストレーター
├── sync-lists.ts                 # リスト同期
├── sync-tasks.ts                 # タスク同期
└── cli.ts                        # CLI エントリポイント
```

## 初回セットアップ

### Azure AD アプリケーション登録

1. [Azure Portal](https://portal.azure.com/) にログイン
2. **Microsoft Entra ID** > **アプリの登録** > **新規登録**
3. 設定値:
   - 名前: `DWH+BI Microsoft Todo Connector`
   - サポートされているアカウントの種類: `任意の組織ディレクトリ内のアカウントと個人の Microsoft アカウント`
   - リダイレクト URI (Web):
     - 本番: `https://{NEXT_PUBLIC_APP_URL}/api/oauth/microsoft_todo/callback`
     - ローカル: `http://localhost:3000/api/oauth/microsoft_todo/callback`
4. **証明書とシークレット** > **新しいクライアント シークレット** を作成
5. **API のアクセス許可** > **アクセス許可の追加** > **Microsoft Graph** > **委任されたアクセス許可**:
   - `Tasks.ReadWrite`
   - `offline_access`

### Console OAuth ルート

Google Calendar と同様に、Console に OAuth ルートを実装する。

```
packages/console/src/app/api/oauth/microsoft_todo/
├── route.ts              # OAuth 認証開始（認証URLを返す）
└── callback/
    └── route.ts          # OAuth コールバック処理（トークン交換・Vault保存）
```

#### route.ts (認証開始)

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceCredentials } from "@/lib/vault";

const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const SCOPES = "Tasks.ReadWrite offline_access";

function getRedirectUri() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/microsoft_todo/callback`;
  }
  return "http://localhost:3000/api/oauth/microsoft_todo/callback";
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}
```

#### callback/route.ts (コールバック処理)

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceCredentials, saveServiceCredentials } from "@/lib/vault";

const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

function getRedirectUri() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/microsoft_todo/callback`;
  }
  return "http://localhost:3000/api/oauth/microsoft_todo/callback";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (error) {
    const errorDescription = url.searchParams.get("error_description") || error;
    return NextResponse.redirect(
      new URL(`/services/microsoft_todo?error=${encodeURIComponent(errorDescription)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/services/microsoft_todo?error=No authorization code received", request.url)
    );
  }

  try {
    const credentials = await getServiceCredentials("microsoft_todo");

    if (!credentials || !credentials.client_id || !credentials.client_secret) {
      return NextResponse.redirect(
        new URL("/services/microsoft_todo?error=Client credentials not configured", request.url)
      );
    }

    const tokenResponse = await fetch(MS_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: credentials.client_id as string,
        client_secret: credentials.client_secret as string,
        code,
        grant_type: "authorization_code",
        redirect_uri: getRedirectUri(),
        scope: "Tasks.ReadWrite offline_access",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      return NextResponse.redirect(
        new URL(`/services/microsoft_todo?error=${encodeURIComponent("Failed to exchange token")}`, request.url)
      );
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return NextResponse.redirect(
        new URL("/services/microsoft_todo?error=No access token received", request.url)
      );
    }

    const updatedCredentials = {
      ...credentials,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || credentials.refresh_token,
      token_type: tokenData.token_type || "Bearer",
      scope: tokenData.scope,
    };

    let expiresAt: string | null = null;
    if (tokenData.expires_in) {
      const expiresAtDate = new Date(Date.now() + tokenData.expires_in * 1000);
      expiresAt = expiresAtDate.toISOString();
    }

    await saveServiceCredentials("microsoft_todo", updatedCredentials, expiresAt);

    return NextResponse.redirect(
      new URL("/services/microsoft_todo?success=OAuth authentication completed", request.url)
    );
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      new URL(`/services/microsoft_todo?error=${encodeURIComponent("OAuth callback failed")}`, request.url)
    );
  }
}
```

### Console サービスページ

Google Calendar と同様に、Console にサービス管理ページを追加する。

```
packages/console/src/app/services/microsoft_todo/
└── page.tsx              # 認証情報管理・OAuth開始ボタン
```

## staging ビュー (参考)

```sql
-- タスクリスト
CREATE VIEW staging.stg_microsoft_todo__lists AS
SELECT
    id,
    source_id,
    source_id as list_id,
    data->>'displayName' as display_name,
    (data->>'isOwner')::boolean as is_owner,
    (data->>'isShared')::boolean as is_shared,
    data->>'wellknownListName' as wellknown_list_name,
    synced_at
FROM raw.microsoft_todo__lists;

-- タスク
CREATE VIEW staging.stg_microsoft_todo__tasks AS
SELECT
    id,
    source_id,
    source_id as task_id,
    data->>'listId' as list_id,
    data->>'title' as title,
    data->'body'->>'content' as body_content,
    data->>'status' as status,
    data->>'importance' as importance,
    (data->>'isReminderOn')::boolean as is_reminder_on,
    data->'categories' as categories,
    (data->>'createdDateTime')::timestamptz as created_at,
    (data->>'lastModifiedDateTime')::timestamptz as last_modified_at,
    (data->>'_completedDateTime_utc')::timestamptz as completed_at,
    (data->>'_dueDateTime_utc')::timestamptz as due_at,
    (data->>'hasAttachments')::boolean as has_attachments,
    data->'recurrence' as recurrence,
    synced_at
FROM raw.microsoft_todo__tasks;

-- 完了タスク履歴 (分析用)
CREATE VIEW staging.stg_microsoft_todo__completed_tasks AS
SELECT
    task_id,
    list_id,
    title,
    status,
    importance,
    completed_at,
    due_at,
    CASE
        WHEN due_at IS NOT NULL AND completed_at IS NOT NULL
        THEN completed_at <= due_at
        ELSE NULL
    END as completed_on_time,
    created_at,
    synced_at
FROM staging.stg_microsoft_todo__tasks
WHERE status = 'completed';
```

## 参考資料

- [Microsoft Graph To Do API Overview](https://learn.microsoft.com/en-us/graph/api/resources/todo-overview)
- [Microsoft Graph Authentication](https://learn.microsoft.com/en-us/graph/auth-v2-user)
- [Microsoft Graph Throttling](https://learn.microsoft.com/en-us/graph/throttling)
- [Azure AD App Registration](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)

## 変更履歴

| 日付 | 変更内容 |
|------|---------|
| 2026-01-04 | 初版作成 |
| 2026-01-04 | CRUD 対応 (`Tasks.ReadWrite` スコープ)、Open Extensions、MCP ツールを追加 |
