-- Microsoft To Do Raw Tables Migration
-- Purpose: Store raw API responses from Microsoft Graph API (To Do) v1.0 for long-term data preservation
-- Structure: JSONB storage with source_id for upsert/deduplication

-- Create raw schema if not exists
CREATE SCHEMA IF NOT EXISTS raw;

-- ============================================================================
-- Task Lists
-- ============================================================================
CREATE TABLE raw.microsoft_todo__lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT NOT NULL UNIQUE,   -- list ID
    data JSONB NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    api_version TEXT DEFAULT 'v1.0'
);

COMMENT ON TABLE raw.microsoft_todo__lists IS 'Microsoft Graph API v1.0 To Do task lists';
COMMENT ON COLUMN raw.microsoft_todo__lists.source_id IS 'Unique identifier: listId from API response';
COMMENT ON COLUMN raw.microsoft_todo__lists.data IS 'Raw JSON response from Microsoft Graph To Do Lists API';
COMMENT ON COLUMN raw.microsoft_todo__lists.api_version IS 'API version used to fetch this data';

CREATE INDEX idx_microsoft_todo__lists_synced_at
    ON raw.microsoft_todo__lists (synced_at);
CREATE INDEX idx_microsoft_todo__lists_data_gin
    ON raw.microsoft_todo__lists USING gin (data);

-- ============================================================================
-- Tasks
-- ============================================================================
CREATE TABLE raw.microsoft_todo__tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT NOT NULL UNIQUE,   -- task ID
    data JSONB NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    api_version TEXT DEFAULT 'v1.0'
);

COMMENT ON TABLE raw.microsoft_todo__tasks IS 'Microsoft Graph API v1.0 To Do tasks';
COMMENT ON COLUMN raw.microsoft_todo__tasks.source_id IS 'Unique identifier: taskId from API response';
COMMENT ON COLUMN raw.microsoft_todo__tasks.data IS 'Raw JSON response from Microsoft Graph To Do Tasks API';
COMMENT ON COLUMN raw.microsoft_todo__tasks.api_version IS 'API version used to fetch this data';

CREATE INDEX idx_microsoft_todo__tasks_synced_at
    ON raw.microsoft_todo__tasks (synced_at);
CREATE INDEX idx_microsoft_todo__tasks_data_gin
    ON raw.microsoft_todo__tasks USING gin (data);
CREATE INDEX idx_microsoft_todo__tasks_list_id
    ON raw.microsoft_todo__tasks ((data->>'listId'));
CREATE INDEX idx_microsoft_todo__tasks_status
    ON raw.microsoft_todo__tasks ((data->>'status'));
CREATE INDEX idx_microsoft_todo__tasks_completed
    ON raw.microsoft_todo__tasks ((data->>'_completedDateTime_utc'));

-- ============================================================================
-- RLS (Row Level Security) 設定
-- raw層はサービスロールのみアクセス可能
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE raw.microsoft_todo__lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw.microsoft_todo__tasks ENABLE ROW LEVEL SECURITY;

-- Service role bypass policy (サービスロールは全操作可能)
CREATE POLICY "Service role has full access to microsoft_todo__lists"
    ON raw.microsoft_todo__lists
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to microsoft_todo__tasks"
    ON raw.microsoft_todo__tasks
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
