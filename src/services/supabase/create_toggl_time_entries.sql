-- Create toggl_time_entries table
-- Based on TogglReportsEntry interface from src/services/toggl/types.ts

CREATE TABLE IF NOT EXISTS toggl_time_entries (
  -- Primary key using Toggl's entry id
  id BIGINT PRIMARY KEY,

  -- Foreign key references (nullable)
  pid BIGINT,                    -- Project ID
  tid BIGINT,                    -- Task ID
  uid BIGINT,                    -- User ID

  -- Entry details
  description TEXT,
  start TIMESTAMPTZ NOT NULL,    -- Start time with timezone
  "end" TIMESTAMPTZ NOT NULL,    -- End time with timezone (quoted because "end" is a reserved word)
  updated TIMESTAMPTZ NOT NULL,  -- Last updated time
  dur BIGINT NOT NULL,           -- Duration in milliseconds

  -- User and project information
  "user" TEXT,                   -- User name (quoted because "user" is a reserved word)
  use_stop BOOLEAN NOT NULL,
  client TEXT,
  project TEXT,
  project_color TEXT,
  project_hex_color TEXT,

  -- Billing information
  billable INTEGER NOT NULL,     -- 0 or 1
  is_billable BOOLEAN NOT NULL,
  cur TEXT,                      -- Currency

  -- Tags (stored as JSONB array)
  tags JSONB DEFAULT '[]'::jsonb,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_toggl_time_entries_start ON toggl_time_entries(start);
CREATE INDEX IF NOT EXISTS idx_toggl_time_entries_end ON toggl_time_entries("end");
CREATE INDEX IF NOT EXISTS idx_toggl_time_entries_pid ON toggl_time_entries(pid);
CREATE INDEX IF NOT EXISTS idx_toggl_time_entries_uid ON toggl_time_entries(uid);
CREATE INDEX IF NOT EXISTS idx_toggl_time_entries_updated ON toggl_time_entries(updated);
CREATE INDEX IF NOT EXISTS idx_toggl_time_entries_synced_at ON toggl_time_entries(synced_at);

-- Add comments for documentation
COMMENT ON TABLE toggl_time_entries IS 'Stores time entries synced from Toggl Track via Reports API';
COMMENT ON COLUMN toggl_time_entries.id IS 'Toggl time entry ID (primary key)';
COMMENT ON COLUMN toggl_time_entries.dur IS 'Duration in milliseconds';
COMMENT ON COLUMN toggl_time_entries.tags IS 'Array of tags stored as JSONB';
COMMENT ON COLUMN toggl_time_entries.synced_at IS 'Timestamp when this record was last synced from Toggl';
