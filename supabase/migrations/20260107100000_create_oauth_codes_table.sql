-- =============================================================================
-- OAuth Authorization Codes Table
-- =============================================================================
--
-- OAuth 2.1 認可コードの一時保存用
-- PKCE (Proof Key for Code Exchange) をサポート
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- oauth_codes テーブル
-- -----------------------------------------------------------------------------
CREATE TABLE public.oauth_codes (
    code TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    code_challenge_method TEXT NOT NULL DEFAULT 'S256',
    scope TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
    used_at TIMESTAMPTZ
);

-- インデックス
CREATE INDEX idx_oauth_codes_user_id ON public.oauth_codes(user_id);
CREATE INDEX idx_oauth_codes_expires_at ON public.oauth_codes(expires_at);

-- コメント
COMMENT ON TABLE public.oauth_codes IS 'OAuth 2.1 認可コード（一時保存、10分で期限切れ）';
COMMENT ON COLUMN public.oauth_codes.code IS '認可コード（ランダム生成）';
COMMENT ON COLUMN public.oauth_codes.code_challenge IS 'PKCE code_challenge';
COMMENT ON COLUMN public.oauth_codes.code_challenge_method IS 'PKCE method (S256)';
COMMENT ON COLUMN public.oauth_codes.used_at IS '使用済みの場合のタイムスタンプ';

-- -----------------------------------------------------------------------------
-- RLS (service_role のみアクセス可能)
-- -----------------------------------------------------------------------------
ALTER TABLE public.oauth_codes ENABLE ROW LEVEL SECURITY;

-- service_role は RLS をバイパスするため、明示的なポリシーは不要

-- -----------------------------------------------------------------------------
-- 期限切れコードの自動削除用関数
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_expired_oauth_codes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.oauth_codes
    WHERE expires_at < now() OR used_at IS NOT NULL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_oauth_codes() TO service_role;

-- -----------------------------------------------------------------------------
-- 完了メッセージ
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE '=== OAuth Codes Table Created ===';
    RAISE NOTICE 'Table: public.oauth_codes';
    RAISE NOTICE 'PKCE support: S256';
    RAISE NOTICE 'Code expiry: 10 minutes';
END $$;
