-- stg_microsoft_todo__checklist_items.sql
-- =============================================================================
-- Microsoft To Do checklist items (subtasks) staging model
-- Source: raw.microsoft_todo__checklist_items (Graph API v1.0)
-- =============================================================================

with source as (
    select * from {{ source('raw_microsoft_todo', 'microsoft_todo__checklist_items') }}
),

staged as (
    select
        -- Primary key
        id,
        source_id as checklist_item_id,

        -- Foreign keys
        data->>'taskId' as task_id,
        data->>'listId' as list_id,

        -- Attributes
        data->>'displayName' as display_name,
        (data->>'isChecked')::boolean as is_checked,

        -- DateTime fields
        data->'checkedDateTime'->>'dateTime' as checked_datetime_local,
        data->'checkedDateTime'->>'timeZone' as checked_timezone,
        (data->>'_checkedDateTime_utc')::timestamptz as checked_at,

        -- Timestamps
        (data->>'createdDateTime')::timestamptz as created_at,

        -- Audit
        synced_at,
        api_version

    from source
)

select * from staged
