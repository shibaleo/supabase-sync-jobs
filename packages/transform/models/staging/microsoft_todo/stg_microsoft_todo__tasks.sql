-- stg_microsoft_todo__tasks.sql
-- =============================================================================
-- Microsoft To Do tasks staging model
-- Source: raw.microsoft_todo__tasks (Graph API v1.0)
-- =============================================================================

with source as (
    select * from {{ source('raw_microsoft_todo', 'microsoft_todo__tasks') }}
),

staged as (
    select
        -- Primary key
        id,
        source_id as task_id,

        -- Foreign keys
        data->>'listId' as list_id,

        -- Core attributes
        data->>'title' as title,
        data->'body'->>'content' as body_content,
        data->'body'->>'contentType' as body_content_type,
        data->>'status' as status,
        data->>'importance' as importance,
        (data->>'isReminderOn')::boolean as is_reminder_on,
        (data->>'hasAttachments')::boolean as has_attachments,

        -- Categories (array)
        data->'categories' as categories,

        -- DateTime fields (with timezone)
        data->'dueDateTime'->>'dateTime' as due_datetime_local,
        data->'dueDateTime'->>'timeZone' as due_timezone,
        data->'startDateTime'->>'dateTime' as start_datetime_local,
        data->'startDateTime'->>'timeZone' as start_timezone,
        data->'completedDateTime'->>'dateTime' as completed_datetime_local,
        data->'completedDateTime'->>'timeZone' as completed_timezone,
        data->'reminderDateTime'->>'dateTime' as reminder_datetime_local,
        data->'reminderDateTime'->>'timeZone' as reminder_timezone,

        -- UTC conversions (computed by connector)
        (data->>'_dueDateTime_utc')::timestamptz as due_at,
        (data->>'_startDateTime_utc')::timestamptz as start_at,
        (data->>'_completedDateTime_utc')::timestamptz as completed_at,

        -- Recurrence
        data->'recurrence'->'pattern'->>'type' as recurrence_type,
        (data->'recurrence'->'pattern'->>'interval')::int as recurrence_interval,
        data->'recurrence'->'pattern'->'daysOfWeek' as recurrence_days_of_week,
        data->'recurrence'->'range'->>'type' as recurrence_range_type,
        data->'recurrence'->'range'->>'startDate' as recurrence_start_date,
        data->'recurrence'->'range'->>'endDate' as recurrence_end_date,

        -- Timestamps
        (data->>'createdDateTime')::timestamptz as created_at,
        (data->>'lastModifiedDateTime')::timestamptz as updated_at,

        -- Audit
        synced_at,
        api_version

    from source
)

select * from staged
