# DEH+BI

個人データエコシステム基盤。複数の外部サービスからデータを取得し、Supabase（PostgreSQL）に統合保存・変換・分析する。

60年以上の長期データ保持と自己理解を目的とし、各サービスの専用ツールを活用しつつ、データは Supabase に集約してベンダー非依存の分析基盤を構築する。

![system config](./docs/img/system_config.png)

## 技術スタック

| カテゴリ | 技術 |
|----------|------|
| Monorepo | Nx 22.2 + npm workspaces |
| ランタイム | Node.js 20.x / Python 3.12 |
| フロントエンド | Next.js 16 / React 19 / Tailwind CSS 4 |
| データベース | PostgreSQL (Supabase) |
| データ変換 | dbt-postgres 1.0+ |
| 認証情報 | PostgreSQL Vault 拡張（AES-256-GCM暗号化） |
| CI/CD | GitHub Actions |
| 可視化 | Grafana |
| AI/ML | Voyage AI (embeddings) / LightGBM |

## プロジェクト構成

```
dwhbi/
├── packages/
│   ├── connector/       # データ収集パイプライン (TypeScript)
│   ├── transform/       # dbt データ変換 (Python/SQL)
│   ├── semanticizer/    # 意味構造構築 (Python) - RAG/KG
│   ├── console/         # 管理UI (Next.js)
│   ├── database-types/  # Supabase型定義 (自動生成)
│   ├── analyzer/        # ML予測分析 (Python)
│   ├── adjuster/        # 調整提案 (Python)
│   ├── reporter/        # レポート生成 (Typst)
│   └── visualizer/      # Grafanaダッシュボード
├── supabase/            # マイグレーション・設定
├── documentation/       # VitePressドキュメント
└── .github/workflows/   # CI/CDパイプライン
```

## データソース

| サービス | 用途 | 認証方式 | スキーマ |
|----------|------|----------|---------|
| [Toggl Track](packages/connector/src/services/toggl_track/) | 時間記録（実績） | API Token | `raw.toggl_track__*` |
| [Google Calendar](packages/connector/src/services/google_calendar/) | 予定（計画） | OAuth 2.0 | `raw.google_calendar__*` |
| [Fitbit](packages/connector/src/services/fitbit/) | 睡眠・心拍・活動 | OAuth 2.0 | `raw.fitbit__*` |
| [Tanita](packages/connector/src/services/tanita/) | 体組成・血圧 | OAuth 2.0 | `raw.tanita__*` |
| [Zaim](packages/connector/src/services/zaim/) | 家計簿 | API Key | `raw.zaim__*` |
| [Coda](packages/connector/src/services/coda/) | マスタデータ | Bearer Token | `raw.coda__*` |
| [GitHub Contents](packages/connector/src/services/github_contents/) | ドキュメント | PAT | `raw.github_contents__*` |
| [Microsoft To Do](packages/connector/src/services/microsoft_todo/) | タスク管理 | OAuth 2.0 | `raw.microsoft_todo__*` |

## クイックスタート

### 前提条件

- Node.js 20.x
- Python 3.12
- Supabase プロジェクト（PostgreSQL + Vault拡張）

### 環境変数

```bash
# 共通（必須）
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxxxx

# dbt用
DBT_HOST=db.xxxxx.supabase.co
DBT_USER=postgres
DBT_PASSWORD=xxxxx
DBT_PORT=5432
DBT_DATABASE=postgres
```

### インストール

```bash
# 依存関係のインストール
npm install

# Python 仮想環境（dbt用）
cd packages/transform
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
```

### 実行

```bash
# 個別サービス同期
npm run sync:toggl -w @repo/connector
npm run sync:gcal -w @repo/connector
npm run sync:coda -w @repo/connector

# dbt 変換
cd packages/transform
../.venv/Scripts/dbt run

# 型定義の再生成
npm run gen:types -w @repo/database-types
```

## アーキテクチャ

### データフロー（4層DWHアーキテクチャ）

```
[External APIs]
       │
       ▼ (Connector: TypeScript)
┌─────────────────────────────────────────────────────────────────────┐
│ raw.*                                                               │
│   外部APIからの生データ（テーブル）                                 │
│   toggl_track__time_entries, google_calendar__events, ...           │
└─────────────────────────────────────────────────────────────────────┘
       │
       ▼ (Transform: dbt)
┌─────────────────────────────────────────────────────────────────────┐
│ staging.*                                                           │
│   クリーニング・正規化済み（ビュー）                                │
│   stg_toggl_track__time_entries, stg_google_calendar__events        │
└─────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ core.*                                                              │
│   サービス統合済みビジネスエンティティ（ビュー）                    │
│   fct_time_entries, fct_transactions, dim_categories                │
└─────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ marts.*                                                             │
│   分析・集計ビュー                                                  │
│   agg_daily_health, agg_weekly_productivity                         │
└─────────────────────────────────────────────────────────────────────┘
```

### 設計思想

| 層 | 役割 | サービス名 | 形式 |
|----|------|-----------|------|
| raw | APIレスポンスをそのまま保存 | あり | テーブル |
| staging | 型変換、列名正規化、タイムゾーン変換 | あり | ビュー |
| core | 複数サービスの統合、ビジネスエンティティ化 | **なし** | ビュー |
| marts | 分析・集計、ドメイン別ビュー | なし | ビュー |

**サービス非依存の設計**: core層以降ではサービス名が消える。将来Togglから別サービスに移行しても、core/marts層は変更不要。

### 命名規則

| 層 | プレフィックス | 例 |
|----|---------------|----|
| staging | `stg_{service}__{entity}` | stg_toggl_track__time_entries |
| core | `fct_` / `dim_` | fct_time_entries, dim_projects |
| marts | `agg_` / ドメイン名 | agg_daily_health |

## Packages 詳細

### @repo/connector

外部APIからデータを取得し、raw層に保存するTypeScriptパイプライン。

```
packages/connector/src/services/{service}/
├── api-client.ts        # API通信・認証（Vault連携）
├── orchestrator.ts      # 同期オーケストレーター
├── sync-masters.ts      # マスタデータ同期
├── sync-{data}.ts       # トランザクションデータ同期
└── cli.ts               # CLIエントリポイント
```

認証情報は PostgreSQL Vault (`vault.secrets`) で暗号化管理。

### @repo/transform

dbt による SQL 変換パイプライン。

```
packages/transform/
├── models/
│   ├── staging/         # stg_* モデル
│   ├── core/            # fct_*, dim_* モデル
│   ├── marts/           # agg_* モデル
│   └── ref/             # マスタデータ
├── seeds/               # 静的データ
└── dbt_project.yml
```

### @repo/console

Next.js 製の管理 UI。Vercel にデプロイ。

- OAuth 再認証管理
- MCP サーバー統合（セマンティック検索）
- Supabase SSR 連携

### @repo/semanticizer

意味構造を構築するパイプライン。MCP Server `personal-context` のバックエンドを生成。

```
packages/semanticizer/src/
├── vector_embedding/    # ベクトル埋め込み → Qdrant (将来)
│   ├── chunker.py       # ドキュメント分割
│   ├── embedder.py      # Voyage AI API
│   └── pipeline.py      # オーケストレーション
│
└── knowledge_graph/     # ナレッジグラフ → Neo4j (将来)
```

| モジュール | 意味構造 | バックエンド |
|-----------|----------|-------------|
| vector_embedding | 意味的類似性 | PostgreSQL → Qdrant |
| knowledge_graph | 意味的関係性 | Neo4j (予定) |

### @repo/analyzer

Python による ML 予測分析。

- LightGBM / scikit-learn（時系列予測）
- コスト行列推定（Wasserstein距離）
- Jupyter Notebook 対応

### @repo/visualizer

Grafana によるダッシュボード。Docker Compose で起動。

```bash
cd packages/visualizer
docker-compose up -d
# http://localhost:3001
```

## GitHub Actions

| ワークフロー | トリガー | 用途 |
|--------------|----------|------|
| `ci.yml` | workflow_dispatch | Lint, Test, Build (Nx affected) |
| `sync-daily.yml` | workflow_dispatch | 全サービス並列同期 + dbt run |
| `dbt-run.yml` | workflow_dispatch / callable | dbt コマンド実行 |
| `deploy-docs.yml` | push to main | VitePress ドキュメントデプロイ |
| `embedding.yml` | workflow_dispatch | Voyage AI embeddings 生成 |
| `sync-*.yml` | workflow_dispatch | 個別サービス同期 |

## MCP Server（Claude連携）

個人ドキュメントをセマンティック検索できるMCPサーバー。Supabase Edge Functions で提供。

### Claude Code 設定

```bash
claude mcp add personal-context \
  --transport http \
  --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  --scope project \
  "https://xxxxx.supabase.co/functions/v1/personal-context"
```

### 利用可能なツール

| ツール | 説明 |
|--------|------|
| `search_docs` | セマンティック検索（自然言語クエリ、タグフィルタ対応） |
| `get_doc` | ドキュメント全文取得 |
| `list_tags` | 使用されているタグ一覧 |
| `list_docs_by_tag` | タグによるドキュメント一覧 |
| `list_docs_by_date` | 日付によるドキュメント一覧 |

## 認証情報管理

全サービスの認証情報は PostgreSQL Vault 拡張で暗号化管理。

```sql
-- 認証情報の保存（自動暗号化）
INSERT INTO vault.secrets (name, secret)
VALUES ('toggl_track', '{"api_token": "xxx"}');

-- 復号化して取得
SELECT * FROM vault.decrypted_secrets WHERE name = 'toggl_track';
```

### 認証パターン

| パターン | サービス | 認証方式 |
|----------|----------|----------|
| A | Fitbit, Tanita, Google, Microsoft | OAuth 2.0 |
| B | Toggl, Zaim | API Token / OAuth 1.0a |
| C | Coda, GitHub | Bearer Token / PAT |

## 開発

### ローカル開発

```bash
# 全パッケージのビルド
npx nx run-many -t build

# 特定パッケージのテスト
npx nx test @repo/connector

# 影響範囲のみビルド
npx nx affected -t build
```

### 型チェック

```bash
# TypeScript
npm run typecheck -w @repo/connector

# Python (mypy)
cd packages/analyzer
mypy src/
```

### テスト

```bash
# Vitest (TypeScript)
npm run test -w @repo/connector

# pytest (Python)
cd packages/transform
pytest tests/
```

## ドキュメント

| カテゴリ | リンク |
|----------|--------|
| VitePressドキュメント | [documentation/](documentation/) |
| Connector サービス | [packages/connector/src/services/](packages/connector/src/services/) |
| dbt モデル | [packages/transform/models/](packages/transform/models/) |
| マイグレーション | [supabase/migrations/](supabase/migrations/) |

## 今後の拡張予定

### 追加予定のデータソース

| サービス | 用途 | 優先度 |
|----------|------|--------|
| Trello | ボード・カード管理 | 中 |
| TickTick | タスク・習慣トラッカー | 高 |
| Habitica | 習慣・ゲーミフィケーション | 中 |
| Readwise | 読書ハイライト | 低 |

### 認知・精神状態の記録

- 集中力・フロー状態 (Rize, RescueTime)
- 気分・感情ログ (Daylio, Pixels)
- 瞑想 (Headspace, Calm)

### 学習と知識管理

- 読書・インプット量 (Goodreads, Booklog)
- アウトプット (GitHub commits, Medium)
- 復習の頻度 (Anki, RemNote)

## 設計哲学

### テンプレート提供に徹する

- 他人のアプリを管理しない
- 各ユーザーが全リソースを所有し、テンプレート提供者への依存なく運用可能
- リポジトリが消えても、ユーザーのシステムは動き続ける

### 60年運用の思想

1. **ベンダー非依存**: core層以降はサービス名が消える
2. **データエクスポート可能**: PostgreSQL標準形式
3. **代替手段の確保**: 各サービスAPI廃止時の移行計画

### 選定基準

1. **API公開**: プログラマティックなデータ取得が可能
2. **データエクスポート**: API未公開でもエクスポート機能があれば検討
3. **継続性**: 長期運用に耐えうるサービスか、代替手段があるか
4. **プライバシー**: 自分のデータのみを対象とする
