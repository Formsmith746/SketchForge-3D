export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  PROJECTS: R2Bucket;
  APP_ENV: "local" | "staging" | "production";
  APP_BASE_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET: string;
  SESSION_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID: string;
  STRIPE_PORTAL_CONFIGURATION_ID: string;
  TERMS_URL: string;
  PRIVACY_URL: string;
  REFUND_URL: string;
  RETENTION_URL: string;
  CURRENT_TERMS_VERSION: string;
  CURRENT_PRIVACY_VERSION: string;
  AUTH_RATE_LIMITER?: RateLimit;
  MUTATION_RATE_LIMITER?: RateLimit;
  ACCOUNT_DELETION_PROCESSING_ENABLED?: string;
}

export interface UserRow {
  id: string;
  google_subject: string;
  email: string;
  email_verified: number;
  display_name: string | null;
  avatar_url: string | null;
  created_at: number;
  last_login_at: number;
  updated_at: number;
  terms_version: string | null;
  privacy_version: string | null;
  legal_accepted_at: number | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  subscription_period_start: number | null;
  subscription_period_end: number | null;
  cancel_at_period_end: number;
  subscription_cancel_at: number | null;
  subscription_ended_at: number | null;
  retention_delete_eligible_at: number | null;
  storage_used_bytes: number;
  storage_allocated_bytes: number;
  project_count: number;
  deletion_requested_at: number | null;
  deleted_at: number | null;
}

export interface SessionRow {
  id_hash: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  authenticated_at: number;
  last_seen_at: number;
}

export interface ProjectRow {
  id: string;
  owner_user_id: string;
  name: string;
  r2_object_key: string;
  size_bytes: number;
  format_version: number;
  version: number;
  created_at: number;
  updated_at: number;
  thumbnail_object_key: string | null;
  thumbnail_updated_at: number | null;
  thumbnail_size_bytes: number;
  deleted_at: number | null;
  object_deletion_status: string | null;
}

export interface SessionContext {
  session: SessionRow;
  user: UserRow;
}
