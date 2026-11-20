-- Add indexes for common report list filters
CREATE INDEX IF NOT EXISTS report_status_created_at_idx ON report(status, created_at DESC);
CREATE INDEX IF NOT EXISTS report_reporter_id_idx ON report(reporter_id);
