-- =============================================================================
-- Copy MCP Tokens to GAS Sync Tokens
-- =============================================================================
--
-- 既存のMCPトークンをGAS Syncトークンテーブルにコピー
-- 一時的な措置として、両方のスコープで同じトークンを使用可能にする
--
-- =============================================================================

-- MCPトークンをGAS Syncトークンにコピー
INSERT INTO public.gas_sync_tokens (
    id,
    user_id,
    token_hash,
    name,
    created_at,
    expires_at,
    last_used_at,
    revoked_at
)
SELECT
    gen_random_uuid(),  -- 新しいIDを生成
    user_id,
    token_hash,
    name || ' (copied from MCP)',  -- 名前にコピー元を明記
    created_at,
    expires_at,
    last_used_at,
    revoked_at
FROM public.mcp_tokens
ON CONFLICT (token_hash) DO NOTHING;  -- 既に存在する場合はスキップ

-- 完了メッセージ
DO $$
DECLARE
    copied_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO copied_count FROM public.gas_sync_tokens;
    RAISE NOTICE '=== MCP Tokens Copied to GAS Sync ===';
    RAISE NOTICE 'Total GAS Sync tokens: %', copied_count;
END $$;
