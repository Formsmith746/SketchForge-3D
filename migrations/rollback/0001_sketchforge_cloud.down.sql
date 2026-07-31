-- Manual staging rollback only. Review before running; this destroys all Cloud data.
DROP TABLE IF EXISTS account_deletion_requests;
DROP TABLE IF EXISTS checkout_sessions;
DROP TABLE IF EXISTS stripe_events;
DROP TABLE IF EXISTS storage_reservations;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS legal_acceptances;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
