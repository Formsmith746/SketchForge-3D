ALTER TABLE users ADD COLUMN storage_allocated_bytes INTEGER NOT NULL DEFAULT 1073741824
  CHECK (storage_allocated_bytes >= 1073741824 AND storage_allocated_bytes <= 21474836480);

UPDATE users
SET storage_allocated_bytes = MIN(
  21474836480,
  MAX(
    1073741824,
    (CAST((storage_used_bytes + 536870912) / 1073741824 AS INTEGER) + 1) * 1073741824
  )
);
