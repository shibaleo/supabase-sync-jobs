-- stg_zaim__money.sql
-- =============================================================================
-- Zaim money (transactions) staging model
-- Source: raw.zaim__money (Zaim API v2)
--
-- Transaction types (mode):
-- - income: 収入
-- - payment: 支出
-- - transfer: 振替
--
-- Note: source_id (Zaim money id) でユニーク化
-- =============================================================================

with source as (
    select * from {{ source('raw_zaim', 'zaim__money') }}
),

staged as (
    select
        -- Primary key (raw層のUUID)
        id,

        -- Source identifier
        source_id,
        (data->>'id')::bigint as zaim_id,

        -- User info
        (data->>'user_id')::bigint as user_id,

        -- Transaction type
        data->>'mode' as mode,

        -- Date and time
        (data->>'date')::date as transaction_date,
        (data->>'created')::timestamptz as created_at,

        -- Amount
        (data->>'amount')::integer as amount,

        -- Category and genre (for payment/income)
        (data->>'category_id')::integer as category_id,
        (data->>'genre_id')::integer as genre_id,

        -- Account (for transfer)
        (data->>'from_account_id')::integer as from_account_id,
        (data->>'to_account_id')::integer as to_account_id,

        -- Description
        data->>'name' as name,
        data->>'place' as place,
        data->>'comment' as comment,

        -- Receipt
        (data->>'receipt_id')::bigint as receipt_id,

        -- Currency
        coalesce(data->>'currency_code', 'JPY') as currency_code,

        -- Status
        (data->>'active')::integer = 1 as is_active,

        -- Audit
        synced_at,
        api_version

    from source
)

select * from staged
