-- =============================================================================
-- GAS Sync Tokens Table
-- =============================================================================
--
-- GAS (Google Apps Script) Sync用のAPIトークン管理
-- MCPトークンとは別スコープで管理
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- gas_sync_tokens テーブル
-- -----------------------------------------------------------------------------
CREATE TABLE public.gas_sync_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

-- インデックス
CREATE INDEX idx_gas_sync_tokens_user_id ON public.gas_sync_tokens(user_id);
CREATE INDEX idx_gas_sync_tokens_token_hash ON public.gas_sync_tokens(token_hash);

-- コメント
COMMENT ON TABLE public.gas_sync_tokens IS 'GAS Sync用のAPIトークン';
COMMENT ON COLUMN public.gas_sync_tokens.token_hash IS 'SHA-256ハッシュ化されたトークン';
COMMENT ON COLUMN public.gas_sync_tokens.name IS 'トークンの識別名（例: Daily Sync）';
COMMENT ON COLUMN public.gas_sync_tokens.expires_at IS '有効期限（NULLの場合は無期限）';
COMMENT ON COLUMN public.gas_sync_tokens.last_used_at IS '最後に使用された日時';
COMMENT ON COLUMN public.gas_sync_tokens.revoked_at IS '無効化された日時';

-- -----------------------------------------------------------------------------
-- RLS (Row Level Security)
-- -----------------------------------------------------------------------------
ALTER TABLE public.gas_sync_tokens ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のトークンのみ参照可能
CREATE POLICY "Users can view own gas_sync tokens"
    ON public.gas_sync_tokens
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- ユーザーは自分のトークンのみ作成可能
CREATE POLICY "Users can create own gas_sync tokens"
    ON public.gas_sync_tokens
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ユーザーは自分のトークンのみ更新可能（revoked_at更新用）
CREATE POLICY "Users can update own gas_sync tokens"
    ON public.gas_sync_tokens
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ユーザーは自分のトークンのみ削除可能
CREATE POLICY "Users can delete own gas_sync tokens"
    ON public.gas_sync_tokens
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- トークン検証用の関数
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_gas_sync_token(p_token_hash TEXT)
RETURNS TABLE (
    user_id UUID,
    token_id UUID,
    is_valid BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.user_id,
        t.id AS token_id,
        (
            t.revoked_at IS NULL
            AND (t.expires_at IS NULL OR t.expires_at > now())
        ) AS is_valid
    FROM public.gas_sync_tokens t
    WHERE t.token_hash = p_token_hash
    LIMIT 1;
END;
$$;

-- service_roleにトークン検証を許可（GAS Web Apps用）
GRANT EXECUTE ON FUNCTION public.validate_gas_sync_token(TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- last_used_at 更新用の関数
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_gas_sync_token_last_used(p_token_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.gas_sync_tokens
    SET last_used_at = now()
    WHERE id = p_token_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_gas_sync_token_last_used(UUID) TO service_role;

-- -----------------------------------------------------------------------------
-- 完了メッセージ
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE '=== GAS Sync Tokens Table Created ===';
    RAISE NOTICE 'Table: public.gas_sync_tokens';
    RAISE NOTICE 'Functions: validate_gas_sync_token, update_gas_sync_token_last_used';
    RAISE NOTICE 'RLS: Enabled with user-based policies';
END $$;
