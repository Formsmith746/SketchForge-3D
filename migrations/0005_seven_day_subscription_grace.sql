-- Clamp every non-active subscription to the seven-day project access grace window.
-- Project data is not deleted by this migration; only the server-side access cutoff changes.
UPDATE users
SET retention_delete_eligible_at =
  COALESCE(subscription_ended_at, subscription_period_end, updated_at) + (7 * 24 * 60 * 60)
WHERE subscription_status IN ('canceled', 'incomplete_expired', 'past_due', 'unpaid', 'paused')
  AND (
    retention_delete_eligible_at IS NULL
    OR retention_delete_eligible_at > COALESCE(subscription_ended_at, subscription_period_end, updated_at) + (7 * 24 * 60 * 60)
  );
