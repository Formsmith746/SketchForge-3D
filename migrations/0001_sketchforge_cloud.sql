PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_subject TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  display_name TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  terms_version TEXT,
  privacy_version TEXT,
  legal_accepted_at INTEGER,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  subscription_status TEXT,
  subscription_period_start INTEGER,
  subscription_period_end INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  subscription_cancel_at INTEGER,
  subscription_ended_at INTEGER,
  retention_delete_eligible_at INTEGER,
  storage_used_bytes INTEGER NOT NULL DEFAULT 0 CHECK (storage_used_bytes >= 0),
  project_count INTEGER NOT NULL DEFAULT 0 CHECK (project_count >= 0),
  deletion_requested_at INTEGER,
  deleted_at INTEGER
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  authenticated_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE legal_acceptances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  accepted_at INTEGER NOT NULL,
  UNIQUE(user_id, terms_version, privacy_version)
);

CREATE INDEX legal_acceptances_user_id_idx ON legal_acceptances(user_id);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  r2_object_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  format_version INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  object_deletion_status TEXT
);

CREATE INDEX projects_owner_updated_idx ON projects(owner_user_id, deleted_at, updated_at DESC);

CREATE TABLE storage_reservations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  byte_delta INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'reserved', 'committed', 'released')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX storage_reservations_status_idx ON storage_reservations(status, created_at);

CREATE TABLE stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  stripe_created_at INTEGER,
  received_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'failed', 'ignored')),
  processed_at INTEGER,
  error_code TEXT
);

CREATE INDEX stripe_events_status_idx ON stripe_events(status, received_at);

CREATE TABLE checkout_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX checkout_sessions_user_id_idx ON checkout_sessions(user_id, updated_at DESC);

CREATE TABLE account_deletion_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested', 'cancel_scheduled', 'approved', 'processing', 'failed', 'completed')),
  execute_after INTEGER,
  last_error_code TEXT
);

CREATE INDEX account_deletion_requests_user_idx ON account_deletion_requests(user_id, requested_at DESC);
