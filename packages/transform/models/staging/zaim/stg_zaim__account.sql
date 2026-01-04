-- stg_zaim__account.sql
-- =============================================================================
-- Zaim account master staging model
-- Source: raw.zaim__account (Zaim API v2)
--
-- Account types: wallet, bank account, credit card, e-money, etc.
-- Used for tracking balances and transfers between accounts.
--
-- Note: source_id (Zaim account id) でユニーク化
-- =============================================================================

with source as (
    select * from {{ source('raw_zaim', 'zaim__account') }}
),

staged as (
    select
        -- Primary key (raw層のUUID)
        id,

        -- Source identifier
        source_id,
        (data->>'id')::integer as account_id,

        -- Account info
        data->>'name' as name,

        -- Hierarchy (for grouped accounts)
        (data->>'parent_account_id')::integer as parent_account_id,

        -- Local and website IDs (for linked accounts)
        (data->>'local_id')::integer as local_id,
        (data->>'website_id')::integer as website_id,

        -- Sort order
        (data->>'sort')::integer as sort_order,

        -- Status
        (data->>'active')::integer = 1 as is_active,

        -- Timestamps
        (data->>'modified')::timestamptz as modified_at,

        -- Audit
        synced_at,
        api_version

    from source
)

select * from staged
