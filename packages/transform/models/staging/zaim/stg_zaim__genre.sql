-- stg_zaim__genre.sql
-- =============================================================================
-- Zaim genre (subcategory) master staging model
-- Source: raw.zaim__genre (Zaim API v2)
--
-- Genre is a subcategory within a category.
-- Example: Category "食費" -> Genre "食料品", "外食", etc.
--
-- Note: source_id (Zaim genre id) でユニーク化
-- =============================================================================

with source as (
    select * from {{ source('raw_zaim', 'zaim__genre') }}
),

staged as (
    select
        -- Primary key (raw層のUUID)
        id,

        -- Source identifier
        source_id,
        (data->>'id')::integer as genre_id,

        -- Genre info
        data->>'name' as name,

        -- Parent category
        (data->>'category_id')::integer as category_id,

        -- Hierarchy (for custom genres)
        (data->>'parent_genre_id')::integer as parent_genre_id,

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
