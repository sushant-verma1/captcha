BEGIN;

ALTER TABLE tracecaptcha_operational_metric_buckets
  DROP CONSTRAINT tracecaptcha_operational_metric_buckets_metric_name_check;

ALTER TABLE tracecaptcha_operational_metric_buckets
  ADD CONSTRAINT tracecaptcha_operational_metric_buckets_metric_name_check
  CHECK (
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
      'challenge_abandoned',
      'dependency_unavailable',
      'false_positive_reported',
      'token_verified',
      'token_rejected'
    )
  );

COMMIT;
