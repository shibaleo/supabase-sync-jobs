-- Microsoft To Do Checklist Items Table Migration
-- Purpose: Store raw API responses for checklist items (subtasks)

-- ============================================================================
-- Checklist Items
-- ============================================================================
CREATE TABLE raw.microsoft_todo__checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT NOT NULL UNIQUE,   -- checklist item ID
    data JSONB NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    api_version TEXT DEFAULT 'v1.0'
);

COMMENT ON TABLE raw.microsoft_todo__checklist_items IS 'Microsoft Graph API v1.0 To Do checklist items (subtasks)';
COMMENT ON COLUMN raw.microsoft_todo__checklist_items.source_id IS 'Unique identifier: checklistItemId from API response';
COMMENT ON COLUMN raw.microsoft_todo__checklist_items.data IS 'Raw JSON response from Microsoft Graph To Do ChecklistItems API';
COMMENT ON COLUMN raw.microsoft_todo__checklist_items.api_version IS 'API version used to fetch this data';

CREATE INDEX idx_microsoft_todo__checklist_items_synced_at
    ON raw.microsoft_todo__checklist_items (synced_at);
CREATE INDEX idx_microsoft_todo__checklist_items_data_gin
    ON raw.microsoft_todo__checklist_items USING gin (data);
CREATE INDEX idx_microsoft_todo__checklist_items_task_id
    ON raw.microsoft_todo__checklist_items ((data->>'taskId'));
CREATE INDEX idx_microsoft_todo__checklist_items_is_checked
    ON raw.microsoft_todo__checklist_items ((data->>'isChecked'));

-- ============================================================================
-- RLS (Row Level Security) 設定
-- ============================================================================
ALTER TABLE raw.microsoft_todo__checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to microsoft_todo__checklist_items"
    ON raw.microsoft_todo__checklist_items
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
