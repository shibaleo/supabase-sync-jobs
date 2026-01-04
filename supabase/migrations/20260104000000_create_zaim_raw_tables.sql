-- Zaim Raw Tables Migration
-- Purpose: Store raw API responses from Zaim API for long-term data preservation
-- Structure: JSONB storage with source_id for upsert/deduplication
-- Replaces: raw.zaim_transactions, raw.zaim_categories, raw.zaim_genres, raw.zaim_accounts

-- ============================================================================
-- Step 1: Create new tables with standardized naming convention
-- ============================================================================

-- Money (Transactions: income, payment, transfer)
CREATE TABLE raw.zaim__money (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT NOT NULL UNIQUE,
    data JSONB NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    api_version TEXT DEFAULT 'v2'
);

COMMENT ON TABLE raw.zaim__money IS 'Zaim API v2 money records (income/payment/transfer)';
COMMENT ON COLUMN raw.zaim__money.source_id IS 'Unique identifier: Zaim money id';
COMMENT ON COLUMN raw.zaim__money.data IS 'Raw JSON containing amount, category_id, genre_id, date, place, etc.';
COMMENT ON COLUMN raw.zaim__money.api_version IS 'API version used to fetch this data';

CREATE INDEX idx_zaim_money_synced_at ON raw.zaim__money (synced_at);
CREATE INDEX idx_zaim_money_data_gin ON raw.zaim__money USING gin (data);

-- Category (User's custom categories)
CREATE TABLE raw.zaim__category (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT NOT NULL UNIQUE,
    data JSONB NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    api_version TEXT DEFAULT 'v2'
);

COMMENT ON TABLE raw.zaim__category IS 'Zaim API v2 user categories';
COMMENT ON COLUMN raw.zaim__category.source_id IS 'Unique identifier: Zaim category id';
COMMENT ON COLUMN raw.zaim__category.data IS 'Raw JSON containing name, mode, sort, parent_category_id, etc.';
COMMENT ON COLUMN raw.zaim__category.api_version IS 'API version used to fetch this data';

CREATE INDEX idx_zaim_category_synced_at ON raw.zaim__category (synced_at);
CREATE INDEX idx_zaim_category_data_gin ON raw.zaim__category USING gin (data);

-- Genre (User's custom genres/subcategories)
CREATE TABLE raw.zaim__genre (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT NOT NULL UNIQUE,
    data JSONB NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    api_version TEXT DEFAULT 'v2'
);

COMMENT ON TABLE raw.zaim__genre IS 'Zaim API v2 user genres (subcategories)';
COMMENT ON COLUMN raw.zaim__genre.source_id IS 'Unique identifier: Zaim genre id';
COMMENT ON COLUMN raw.zaim__genre.data IS 'Raw JSON containing name, category_id, sort, parent_genre_id, etc.';
COMMENT ON COLUMN raw.zaim__genre.api_version IS 'API version used to fetch this data';

CREATE INDEX idx_zaim_genre_synced_at ON raw.zaim__genre (synced_at);
CREATE INDEX idx_zaim_genre_data_gin ON raw.zaim__genre USING gin (data);

-- Account (User's accounts: wallet, bank, credit card, etc.)
CREATE TABLE raw.zaim__account (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT NOT NULL UNIQUE,
    data JSONB NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    api_version TEXT DEFAULT 'v2'
);

COMMENT ON TABLE raw.zaim__account IS 'Zaim API v2 user accounts';
COMMENT ON COLUMN raw.zaim__account.source_id IS 'Unique identifier: Zaim account id';
COMMENT ON COLUMN raw.zaim__account.data IS 'Raw JSON containing name, sort, active, parent_account_id, etc.';
COMMENT ON COLUMN raw.zaim__account.api_version IS 'API version used to fetch this data';

CREATE INDEX idx_zaim_account_synced_at ON raw.zaim__account (synced_at);
CREATE INDEX idx_zaim_account_data_gin ON raw.zaim__account USING gin (data);

-- ============================================================================
-- Step 2: Enable RLS (Row Level Security)
-- ============================================================================

ALTER TABLE raw.zaim__money ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw.zaim__category ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw.zaim__genre ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw.zaim__account ENABLE ROW LEVEL SECURITY;

-- Service role bypass policy (サービスロールは全操作可能)
CREATE POLICY "Service role has full access to zaim__money"
    ON raw.zaim__money FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to zaim__category"
    ON raw.zaim__category FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to zaim__genre"
    ON raw.zaim__genre FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to zaim__account"
    ON raw.zaim__account FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Authenticated users read policy (認証ユーザーは読み取り可能)
CREATE POLICY "Allow authenticated users to read zaim__money"
    ON raw.zaim__money FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to read zaim__category"
    ON raw.zaim__category FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to read zaim__genre"
    ON raw.zaim__genre FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to read zaim__account"
    ON raw.zaim__account FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- Step 3: Migrate data from old tables to new tables
-- ============================================================================

-- Migrate transactions -> money
INSERT INTO raw.zaim__money (source_id, data, synced_at)
SELECT
    zaim_id::TEXT as source_id,
    jsonb_build_object(
        'id', zaim_id,
        'mode', transaction_type,
        'user_id', zaim_user_id,
        'date', date,
        'category_id', category_id,
        'genre_id', genre_id,
        'to_account_id', to_account_id,
        'from_account_id', from_account_id,
        'amount', amount,
        'comment', comment,
        'active', CASE WHEN is_active THEN 1 ELSE 0 END,
        'name', name,
        'receipt_id', receipt_id,
        'place', place,
        'created', created_at,
        'currency_code', 'JPY',
        '_migrated_from', 'zaim_transactions',
        '_migrated_at', now()
    ) as data,
    COALESCE(synced_at, now()) as synced_at
FROM raw.zaim_transactions
ON CONFLICT (source_id) DO NOTHING;

-- Migrate categories -> category
INSERT INTO raw.zaim__category (source_id, data, synced_at)
SELECT
    id::TEXT as source_id,
    jsonb_build_object(
        'id', id,
        'name', name,
        'mode', mode,
        'sort', sort_order,
        'parent_category_id', 0,
        'active', CASE WHEN is_active THEN 1 ELSE 0 END,
        'modified', synced_at,
        '_user_id', zaim_user_id,
        '_migrated_from', 'zaim_categories',
        '_migrated_at', now()
    ) as data,
    COALESCE(synced_at, now()) as synced_at
FROM raw.zaim_categories
ON CONFLICT (source_id) DO NOTHING;

-- Migrate genres -> genre
INSERT INTO raw.zaim__genre (source_id, data, synced_at)
SELECT
    id::TEXT as source_id,
    jsonb_build_object(
        'id', id,
        'name', name,
        'sort', sort_order,
        'active', CASE WHEN is_active THEN 1 ELSE 0 END,
        'category_id', category_id,
        'parent_genre_id', 0,
        'modified', synced_at,
        '_user_id', zaim_user_id,
        '_migrated_from', 'zaim_genres',
        '_migrated_at', now()
    ) as data,
    COALESCE(synced_at, now()) as synced_at
FROM raw.zaim_genres
ON CONFLICT (source_id) DO NOTHING;

-- Migrate accounts -> account
INSERT INTO raw.zaim__account (source_id, data, synced_at)
SELECT
    id::TEXT as source_id,
    jsonb_build_object(
        'id', id,
        'name', name,
        'modified', synced_at,
        'sort', sort_order,
        'active', CASE WHEN is_active THEN 1 ELSE 0 END,
        'local_id', id,
        'website_id', 0,
        'parent_account_id', 0,
        '_user_id', zaim_user_id,
        '_migrated_from', 'zaim_accounts',
        '_migrated_at', now()
    ) as data,
    COALESCE(synced_at, now()) as synced_at
FROM raw.zaim_accounts
ON CONFLICT (source_id) DO NOTHING;

-- ============================================================================
-- Step 4: Verify migration (check record counts)
-- ============================================================================

DO $$
DECLARE
    old_money_count INTEGER;
    new_money_count INTEGER;
    old_category_count INTEGER;
    new_category_count INTEGER;
    old_genre_count INTEGER;
    new_genre_count INTEGER;
    old_account_count INTEGER;
    new_account_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO old_money_count FROM raw.zaim_transactions;
    SELECT COUNT(*) INTO new_money_count FROM raw.zaim__money;
    SELECT COUNT(*) INTO old_category_count FROM raw.zaim_categories;
    SELECT COUNT(*) INTO new_category_count FROM raw.zaim__category;
    SELECT COUNT(*) INTO old_genre_count FROM raw.zaim_genres;
    SELECT COUNT(*) INTO new_genre_count FROM raw.zaim__genre;
    SELECT COUNT(*) INTO old_account_count FROM raw.zaim_accounts;
    SELECT COUNT(*) INTO new_account_count FROM raw.zaim__account;

    RAISE NOTICE 'Migration verification:';
    RAISE NOTICE '  zaim_transactions: % -> zaim__money: %', old_money_count, new_money_count;
    RAISE NOTICE '  zaim_categories: % -> zaim__category: %', old_category_count, new_category_count;
    RAISE NOTICE '  zaim_genres: % -> zaim__genre: %', old_genre_count, new_genre_count;
    RAISE NOTICE '  zaim_accounts: % -> zaim__account: %', old_account_count, new_account_count;

    IF old_money_count != new_money_count THEN
        RAISE EXCEPTION 'Money migration count mismatch: old=% new=%', old_money_count, new_money_count;
    END IF;
    IF old_category_count != new_category_count THEN
        RAISE EXCEPTION 'Category migration count mismatch: old=% new=%', old_category_count, new_category_count;
    END IF;
    IF old_genre_count != new_genre_count THEN
        RAISE EXCEPTION 'Genre migration count mismatch: old=% new=%', old_genre_count, new_genre_count;
    END IF;
    IF old_account_count != new_account_count THEN
        RAISE EXCEPTION 'Account migration count mismatch: old=% new=%', old_account_count, new_account_count;
    END IF;

    RAISE NOTICE 'All migrations verified successfully!';
END $$;

-- ============================================================================
-- Step 5: Drop old tables
-- ============================================================================

-- Remove old RLS policies first
DROP POLICY IF EXISTS "Allow authenticated users to read zaim_transactions" ON raw.zaim_transactions;
DROP POLICY IF EXISTS "Allow authenticated users to read zaim_categories" ON raw.zaim_categories;
DROP POLICY IF EXISTS "Allow authenticated users to read zaim_genres" ON raw.zaim_genres;
DROP POLICY IF EXISTS "Allow authenticated users to read zaim_accounts" ON raw.zaim_accounts;

-- Drop old tables (CASCADE to handle foreign key constraints)
-- Order: child tables first, then parent tables
DROP TABLE IF EXISTS raw.zaim_transactions CASCADE;
DROP TABLE IF EXISTS raw.zaim_genres CASCADE;
DROP TABLE IF EXISTS raw.zaim_categories CASCADE;
DROP TABLE IF EXISTS raw.zaim_accounts CASCADE;
