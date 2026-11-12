import type { ProtectedAction } from "@tracecaptcha/shared-types";

export const operationalMetricNames = [
  "decision_allow",
  "decision_challenge",
  "decision_retry",
  "decision_cooldown",
  "decision_block",
  "challenge_created",
  "challenge_completed",
  "challenge_retry",
  "challenge_expired",
  "challenge_replayed",
  "dependency_unavailable",
  "false_positive_reported",
  "token_verified",
  "token_rejected",
] as const;

export type OperationalMetricName = (typeof operationalMetricNames)[number];

export type OperationalMetric = {
  customerId: string;
  siteId: string;
  action: ProtectedAction;
  name: OperationalMetricName;
  durationMs?: number;
};

export type OperationalMetricsRecorder = {
  record(metric: OperationalMetric): Promise<void>;
};

export type OperationalMetricsDatabase = {
  query(text: string, values: readonly unknown[]): Promise<unknown>;
};

/**
 * Stores only daily, non-identifying aggregate counters. Do not add request,
 * session, network, trace, token, score, or rule fields to this boundary.
 */
export class PostgresOperationalMetricsRecorder implements OperationalMetricsRecorder {
  public constructor(private readonly database: OperationalMetricsDatabase) {}

  public async record(metric: OperationalMetric): Promise<void> {
    assertMetric(metric);

    await this.database.query(
      `
        INSERT INTO tracecaptcha_operational_metric_buckets (
          bucket_start,
          customer_id,
          site_id,
          action,
          metric_name,
          event_count,
          total_duration_ms
        )
        VALUES (date_trunc('day', CURRENT_TIMESTAMP), $1, $2, $3, $4, 1, $5)
        ON CONFLICT (bucket_start, customer_id, site_id, action, metric_name)
        DO UPDATE SET
          event_count = tracecaptcha_operational_metric_buckets.event_count + 1,
          total_duration_ms =
            tracecaptcha_operational_metric_buckets.total_duration_ms + EXCLUDED.total_duration_ms,
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        metric.customerId,
        metric.siteId,
        metric.action,
        metric.name,
        metric.durationMs ?? 0,
      ],
    );
  }
}

function assertMetric(metric: OperationalMetric): void {
  if (
    metric.customerId.length === 0 ||
    metric.siteId.length === 0 ||
    !operationalMetricNames.includes(metric.name) ||
    (metric.durationMs !== undefined &&
      (!Number.isSafeInteger(metric.durationMs) || metric.durationMs < 0))
  ) {
    throw new Error("Invalid operational metric.");
  }
}
