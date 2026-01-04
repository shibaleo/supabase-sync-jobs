-- stg_zaim__category.sql
-- =============================================================================
-- Zaim category master staging model
-- Source: raw.zaim__category (Zaim API v2)
--
-- Category modes:
-- - payment: 支出カテゴリ
-- - income: 収入カテゴリ
--
-- Note: source_id (Zaim category id) でユニーク化
-- =============================================================================

with source as (
    select * from {{ source('raw_zaim', 'zaim__category') }}
),

staged as (
    select
        -- Primary key (raw層のUUID)
        id,

        -- Source identifier
        source_id,
        (data->>'id')::integer as category_id,

        -- Category info
        data->>'name' as name,
        data->>'mode' as mode,

        -- Hierarchy
        (data->>'parent_category_id')::integer as parent_category_id,

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
