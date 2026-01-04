-- stg_microsoft_todo__lists.sql
-- =============================================================================
-- Microsoft To Do lists staging model
-- Source: raw.microsoft_todo__lists (Graph API v1.0)
-- =============================================================================

with source as (
    select * from {{ source('raw_microsoft_todo', 'microsoft_todo__lists') }}
),

staged as (
    select
        -- Primary key
        id,
        source_id as list_id,

        -- Attributes
        data->>'displayName' as display_name,
        (data->>'isOwner')::boolean as is_owner,
        (data->>'isShared')::boolean as is_shared,
        data->>'wellknownListName' as wellknown_list_name,

        -- Audit
        synced_at,
        api_version

    from source
)

select * from staged
