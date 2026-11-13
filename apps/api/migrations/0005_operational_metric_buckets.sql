BEGIN;

ALTER TABLE tracecaptcha_sites
  ADD CONSTRAINT tracecaptcha_sites_id_customer_unique
  UNIQUE (id, customer_id);

CREATE TABLE tracecaptcha_operational_metric_buckets (
  bucket_start TIMESTAMPTZ NOT NULL,
  customer_id UUID NOT NULL REFERENCES tracecaptcha_customers (id) ON DELETE RESTRICT,
  site_id UUID NOT NULL REFERENCES tracecaptcha_sites (id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (
    action IN ('signup', 'login', 'password_reset', 'otp_request')
  ),
  metric_name TEXT NOT NULL CHECK (
    metric_name IN (
      'decision_allow',
      'decision_challenge',
      'decision_retry',
      'decision_cooldown',
      'decision_block',
      'challenge_created',
      'challenge_completed',
      'challenge_retry',
      'challenge_expired',
      'challenge_replayed',
      'dependency_unavailable',
      'token_verified',
      'token_rejected'
    )
  ),
  event_count BIGINT NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  total_duration_ms BIGINT NOT NULL DEFAULT 0 CHECK (total_duration_ms >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bucket_start, customer_id, site_id, action, metric_name),
  FOREIGN KEY (site_id, customer_id)
    REFERENCES tracecaptcha_sites (id, customer_id)
    ON DELETE CASCADE
);

CREATE INDEX tracecaptcha_operational_metric_buckets_site_bucket_idx
  ON tracecaptcha_operational_metric_buckets (site_id, bucket_start DESC);

COMMIT;
