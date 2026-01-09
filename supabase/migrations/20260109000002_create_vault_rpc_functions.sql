-- =============================================================================
-- Vault RPC Functions for GAS Sync
-- =============================================================================
--
-- vault.decrypted_secretsへのアクセスをRPC経由で提供
-- PostgRESTでvaultスキーマが公開されていないため、RPC関数で代替
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- シークレット取得用RPC関数
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_service_secret(p_service_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
    v_secret JSON;
BEGIN
    SELECT decrypted_secret::json INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = p_service_name
    LIMIT 1;

    IF v_secret IS NULL THEN
        RAISE EXCEPTION 'Secret not found for service: %', p_service_name;
    END IF;

    RETURN v_secret;
END;
$$;

-- service_roleにのみ実行を許可
REVOKE ALL ON FUNCTION public.get_service_secret(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_service_secret(TEXT) TO service_role;

COMMENT ON FUNCTION public.get_service_secret(TEXT) IS 'Vault からサービスのシークレットを取得（service_role専用）';

-- -----------------------------------------------------------------------------
-- シークレット更新用RPC関数
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_service_secret(
    p_service_name TEXT,
    p_new_secret TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
    v_secret_id UUID;
BEGIN
    -- 既存のシークレットIDを取得
    SELECT id INTO v_secret_id
    FROM vault.secrets
    WHERE name = p_service_name
    LIMIT 1;

    IF v_secret_id IS NULL THEN
        RAISE EXCEPTION 'Secret not found for service: %', p_service_name;
    END IF;

    -- シークレットを更新（vault.update_secret関数を使用）
    PERFORM vault.update_secret(v_secret_id, p_new_secret, NULL, NULL);
END;
$$;

-- service_roleにのみ実行を許可
REVOKE ALL ON FUNCTION public.update_service_secret(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_service_secret(TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.update_service_secret(TEXT, TEXT) IS 'Vault のサービスシークレットを更新（service_role専用）';

-- -----------------------------------------------------------------------------
-- 完了メッセージ
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE '=== Vault RPC Functions Created ===';
    RAISE NOTICE 'Functions: get_service_secret, update_service_secret';
    RAISE NOTICE 'Access: service_role only';
END $$;
