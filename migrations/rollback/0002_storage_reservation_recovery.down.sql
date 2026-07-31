-- SQLite/D1 cannot drop these columns safely in place on all supported versions.
-- To reverse, rebuild storage_reservations without old_object_key,
-- new_object_key, and expected_project_version after exporting its rows.
DROP INDEX IF EXISTS storage_reservations_user_status_idx;
