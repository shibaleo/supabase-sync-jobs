---
title: MCP メタツール実装計画
description: Vercel + メタツール方式による MCP 最適化
created: 2026-01-07
status: 計画中
sources:
  - confluence:DEVDOC-950274
  - github:dwhbi#17
  - github:dwhbi#19
  - github:dwhbi#20
---

# MCP メタツール実装計画

## 概要

MCP エンドポイントを Vercel に配置し、メタツール方式でトークン消費を削減しつつ、マルチユーザー対応を実現する。

**スコープ**: MCP エンドポイントの Vercel 移行のみ。同期処理（GAS 移行）は本計画の範囲外。

---

## 背景・課題

> 出典: [confluence:DEVDOC-950274](https://shibaleo.atlassian.net/wiki/spaces/DEVDOC/pages/950274), [github:dwhbi#17](https://github.com/shibaleo/dwhbi/issues/17), [github:dwhbi#19](https://github.com/shibaleo/dwhbi/issues/19)

### 現状の問題

| 問題 | 詳細 | 出典 |
|------|------|------|
| **トークン消費** | 80 ツール × 約 200 トークン ≈ 16,000 トークン/セッション | [github:dwhbi#17](https://github.com/shibaleo/dwhbi/issues/17) |
| **URL 露出** | Supabase プロジェクト ID が公開される | [github:dwhbi#19](https://github.com/shibaleo/dwhbi/issues/19) |
| **トークン更新** | JWT 期限切れ時にユーザーが MCP 設定を手動更新（非現実的） | [github:dwhbi#19](https://github.com/shibaleo/dwhbi/issues/19) |

---

## 解決策: Vercel + メタツール方式

> 出典: [github:dwhbi#20](https://github.com/shibaleo/dwhbi/issues/20)

### アーキテクチャ

```
Claude.ai
    ↓ Authorization: Bearer <OAuth token>
Vercel (TypeScript)
    ├── MCP プロトコル処理
    ├── メタツール (get_module_schema, call_module_tool)
    ├── 実ツール実装 (各モジュール)
    └── Supabase 直接アクセス（環境変数: SUPABASE_URL, SUPABASE_ANON_KEY）
         ↓
    Supabase (DB + Auth + Vault)
```

**設計方針**:
- Supabase Edge Functions は使用しない（レイヤー削減、レイテンシ軽減）
- MCP ツールは Vercel に TypeScript で直接実装
- Supabase は DB・Auth・Vault として利用
- Vault アクセスは環境変数（SUPABASE_URL, SUPABASE_ANON_KEY）で認証

### トークン節約効果

> 出典: [github:dwhbi#17](https://github.com/shibaleo/dwhbi/issues/17), [github:dwhbi#20](https://github.com/shibaleo/dwhbi/issues/20)

| | 従来 | メタツール |
|---|---|---|
| **固定コンテキスト** | 80 ツール定義 (16,000 トークン) | 2 ツール定義 (~300 トークン) |
| **累積コンテキスト** | - | 必要時に schema 取得 |
| **典型ケース** | 16,000 トークン | 1,500〜3,000 トークン |
| **compress 後** | 16,000 から再開 | 300 から再開 |

**「使わないツールの定義を読み込まない」のが本質**。

### 実証済み事項

- **Claude の 2 ステップ挙動**: 固定プロンプトで `get_module_schema` → `call_module_tool` の流れを実証済み
- **Vercel 10 秒制限**: 各ツール呼び出しが 10 秒以内に収まることを検証済み

---

## 利用フロー

> 出典: [github:dwhbi#17](https://github.com/shibaleo/dwhbi/issues/17), [github:dwhbi#20](https://github.com/shibaleo/dwhbi/issues/20)

```
[セッション開始]
Claude.ai → Vercel tools/list
    → メタツール 2 個だけ返す（~300 トークン）

[ユーザー: GitHub のリポ見せて]
Claude: get_module_schema("github")
    → Vercel がモジュール定義を返す（キャッシュあり）
    → 累積コンテキストに GitHub ツール定義が入る
Claude: call_module_tool("github", "list_repos", {...})
    → Vercel が直接 GitHub API を呼び出し

[ユーザー: ありがとう、また明日]
    → ツール呼ばれず終了
```

---

## キャッシュ戦略

### スキーマキャッシュ

| キャッシュ対象 | TTL | 保存場所 | 備考 |
|---------------|-----|----------|------|
| モジュールスキーマ | 24時間 | メモリ | ツール定義は頻繁に変わらない |
| ユーザー設定 | 5分 | メモリ | enabled_modules 等 |

### キャッシュ無効化

- デプロイ時に自動クリア
- Console UI から手動クリア可能

---

## モジュール構成

> 出典: [github:dwhbi#17](https://github.com/shibaleo/dwhbi/issues/17)

| モジュール | ツール数 | 内容 |
|------------|----------|------|
| core (常時有効) | ~10 | Supabase, RAG |
| github | ~20 | リポジトリ、Issue、PR |
| atlassian | ~25 | Jira、Confluence |
| google_calendar | ~10 | 予定管理 |
| microsoft_todo | ~8 | タスク管理 |
| notion | ~12 | ページ・DB 操作 |

### 移植工数

- Deno → TypeScript は軽微な修正のみ（npm モジュール依存なし）
- 全体で約 1 時間程度

---

## 実装詳細

### Vercel: メタツール定義

> 出典: [github:dwhbi#17](https://github.com/shibaleo/dwhbi/issues/17), [github:dwhbi#20](https://github.com/shibaleo/dwhbi/issues/20)

```typescript
const META_TOOLS = [
  {
    name: "get_module_schema",
    description: `モジュールのツール定義を取得。`,
    inputSchema: {
      type: "object",
      properties: { module: { type: "string" } },
      required: ["module"]
    }
  },
  {
    name: "call_module_tool",
    description: `
モジュールのツールを呼び出す。

【利用可能モジュール】
- github: リポジトリ、Issue、PR 操作
- atlassian: Jira、Confluence 操作
- google_calendar: 予定の取得・作成
- microsoft_todo: タスク管理
- notion: ページ・データベース操作
- rag: ドキュメント検索
- supabase: DB 操作

【使い方】
1. get_module_schema(module) でツール一覧とパラメータを確認
2. call_module_tool(module, tool_name, params) で実行
`,
    inputSchema: {
      type: "object",
      properties: {
        module: { type: "string" },
        tool_name: { type: "string" },
        params: { type: "object" }
      },
      required: ["module", "tool_name"]
    }
  }
];
```

### Vercel: ツール呼び出し処理

```typescript
// モジュール定義（キャッシュ対象）
const moduleRegistry = {
  github: {
    tools: [...],  // ツール定義
    handler: githubHandler  // 実行ハンドラ
  },
  // ...
};

async function handleToolCall(userId: string, name: string, args: any) {
  switch (name) {
    case "get_module_schema":
      // キャッシュから取得、なければ生成
      return getModuleSchema(args.module);

    case "call_module_tool":
      const module = moduleRegistry[args.module];
      return module.handler(userId, args.tool_name, args.params);
  }
}
```

---

## 認証

### 認証方式

> 出典: [github:dwhbi#19](https://github.com/shibaleo/dwhbi/issues/19)

| 方式 | ステータス | 用途 |
|------|-----------|------|
| **OAuth 2.1** | 初期実装 | ブラウザ経由での認証（現行方式を継続） |
| API Token | 後日実装 | プログラマティックアクセス |

### 認証フロー（OAuth 2.1）

```
ユーザー
    │ 1. Console UI でログイン
    ▼
Vercel (console)
    ├── Supabase Auth でセッション管理
    ├── MCP 用トークン発行
    └── トークン自動更新（Supabase Auth の機能）
    │
    │ 2. MCP 設定に Bearer トークンを設定
    ▼
Claude.ai → Vercel /mcp
    └── トークン検証 → Supabase にユーザー特定
```

### コンテキストに見える/見えない情報

> 出典: [github:dwhbi#20](https://github.com/shibaleo/dwhbi/issues/20)

| 情報 | 可視性 | 保護方法 |
|------|--------|----------|
| モジュール名 | 公開 | - |
| ツール名、パラメータ | 公開 | - |
| API キー、OAuth トークン | 非公開 | Vault |
| 他ユーザーのデータ | 非公開 | RLS |

---

## 課金・権限制御

> 出典: [github:dwhbi#20](https://github.com/shibaleo/dwhbi/issues/20)

### 初期実装

- 全モジュール利用可能（制限なし）
- 課金チェックは実装しない

### 将来検討事項（実装後に再検討）

- モジュール別の有効/無効制御
- プラン別のアクセス制限
- 事前フィルタリング（利用不可モジュールを非表示）
- エラーハンドリング（課金チェック失敗時の UX）

---

## インフラ構成

### 全体像

> 出典: [confluence:DEVDOC-950274](https://shibaleo.atlassian.net/wiki/spaces/DEVDOC/pages/950274)

```
ユーザー/Claude
    │
    │ Authorization: Bearer <token>
    ▼
┌─────────────────────────────────────────┐
│ Vercel (console)                        │
│ ├── /mcp/*      → MCP実装 (TypeScript)  │
│ ├── /api/*      → REST API              │
│ ├── /auth/*     → Supabase Auth         │
│ └── UI          → 管理画面              │
│                                         │
│ 環境変数:                               │
│ ├── SUPABASE_URL                        │
│ └── SUPABASE_ANON_KEY                   │
└─────────────────────────────────────────┘
    │
    ▼
┌──────────────┐
│   Supabase   │
│ ├── DB       │
│ ├── Auth     │
│ └── Vault    │
└──────────────┘
```

---

## 実装タスク

### Phase 1: Vercel MCP エンドポイント

> 出典: [github:dwhbi#19](https://github.com/shibaleo/dwhbi/issues/19), [github:dwhbi#20](https://github.com/shibaleo/dwhbi/issues/20)

- [ ] MCP プロトコルハンドラ実装
- [ ] OAuth 2.1 認証処理（現行方式を移植）
- [ ] `get_module_schema` 実装
- [ ] `call_module_tool` 実装
- [ ] スキーマキャッシュ実装

### Phase 2: モジュール移植（全体 1h 程度）

- [ ] core モジュール（Supabase, RAG）
- [ ] github モジュール
- [ ] atlassian モジュール
- [ ] google_calendar モジュール
- [ ] microsoft_todo モジュール
- [ ] notion モジュール

### Phase 3: 動作検証

- [ ] Claude での E2E テスト
- [ ] レイテンシ計測
- [ ] キャッシュ動作確認

### Phase 4: 後日対応

- [ ] API Token 認証
- [ ] 課金・権限制御（必要に応じて）
- [ ] エラーハンドリング改善（実装後リファクタ）
- [ ] カスタムドメイン設定

---

## スコープ外

以下は本計画の範囲外とし、別途検討する:

| 項目 | 理由 |
|------|------|
| 同期処理の GAS 移行 | 同期処理は現行のまま維持 |
| Supabase Edge Functions | Vercel に統合するため不要 |
| 課金・権限の詳細設計 | 実装後に UX を見て再検討 |
| エラーハンドリング詳細 | 実装後のリファクタで対応 |

---

## 関連ドキュメント

| 種別 | リンク | 内容 |
|------|--------|------|
| Confluence | [DEVDOC-950274](https://shibaleo.atlassian.net/wiki/spaces/DEVDOC/pages/950274) | リポジトリ構成刷新案 (2026-01) |
| GitHub Issue | [dwhbi#17](https://github.com/shibaleo/dwhbi/issues/17) | MCP 動的ツール選択によるコンテキスト最適化 |
| GitHub Issue | [dwhbi#19](https://github.com/shibaleo/dwhbi/issues/19) | MCP エンドポイントを Vercel プロキシ経由に変更 |
| GitHub Issue | [dwhbi#20](https://github.com/shibaleo/dwhbi/issues/20) | Vercel にメタツール MCP エンドポイントを実装 |

---

*作成日: 2026-01-07*
*更新日: 2026-01-07*
