ALTER TABLE storage_reservations ADD COLUMN old_object_key TEXT;
ALTER TABLE storage_reservations ADD COLUMN new_object_key TEXT;
ALTER TABLE storage_reservations ADD COLUMN expected_project_version INTEGER;

CREATE INDEX storage_reservations_user_status_idx
  ON storage_reservations(user_id, status, created_at);
