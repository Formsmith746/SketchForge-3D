ALTER TABLE projects ADD COLUMN thumbnail_object_key TEXT;
ALTER TABLE projects ADD COLUMN thumbnail_updated_at INTEGER;
ALTER TABLE projects ADD COLUMN thumbnail_size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (thumbnail_size_bytes >= 0);
