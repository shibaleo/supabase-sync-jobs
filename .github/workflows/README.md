# GitHub Actions Setup

このディレクトリには、Togglのエントリーを定期的にSupabaseに同期するためのGitHub Actionsワークフローが含まれています。

## ワークフロー

### `sync-toggl.yml`
- **実行頻度**: 30分ごと
- **動作**: 最新のTogglエントリーをSupabaseに同期

## セットアップ手順

GitHubリポジトリで以下のSecretsを設定する必要があります：

1. GitHubリポジトリの **Settings** > **Secrets and variables** > **Actions** に移動

2. 以下のSecretsを追加（**New repository secret** をクリック）：

| Secret名 | 値 |
|---------|-----|
| `TOGGL_API_TOKEN` | Toggl APIトークン |
| `TOGGL_WORKSPACE_ID` | TogglワークスペースID |
| `SUPABASE_URL` | Supabaseプロジェクトの URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabaseサービスロールキー |

## 手動実行

ワークフローは手動でも実行できます：

1. GitHubリポジトリの **Actions** タブに移動
2. 左サイドバーから **Sync Toggl to Supabase** を選択
3. **Run workflow** ボタンをクリック

## cronスケジュール

```yaml
cron: '*/30 * * * *'  # 30分ごとに実行
```

### cronの形式
```
┌───────────── 分 (0 - 59)
│ ┌───────────── 時 (0 - 23)
│ │ ┌───────────── 日 (1 - 31)
│ │ │ ┌───────────── 月 (1 - 12)
│ │ │ │ ┌───────────── 曜日 (0 - 6) (日曜日から土曜日)
│ │ │ │ │
* * * * *
```

### その他のスケジュール例
- `0 * * * *` - 毎時0分（1時間ごと）
- `0 */2 * * *` - 2時間ごと
- `0 9 * * *` - 毎日9:00 UTC
- `0 0 * * 0` - 毎週日曜日の0:00 UTC

## 注意事項

- GitHub Actionsの無料枠では、月2000分まで利用可能
- cronジョブはUTC時間で実行されます
- 実行タイミングは数分ずれる可能性があります
