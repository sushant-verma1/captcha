import type { Pool } from "pg";

import type {
  RateLimitPolicy,
  RateLimitPolicyLookup,
  RateLimitScope,
} from "./rate-limit.js";

type RateLimitRow = {
  rateLimits: unknown;
};

export class PostgresRateLimitPolicyLookup implements RateLimitPolicyLookup {
  public constructor(private readonly database: Pick<Pool, "query">) {}

  public async find(scope: RateLimitScope): Promise<RateLimitPolicy | null> {
    const result = await this.database.query<RateLimitRow>(
      `SELECT rate_limits AS "rateLimits" FROM tracecaptcha_site_action_policies WHERE site_id = $1 AND action = $2 AND status = 'active' ORDER BY version DESC LIMIT 1`,
      [scope.siteId, scope.action],
    );
    const row = result.rows[0];

    if (row === undefined || !isRecord(row.rateLimits)) {
      return null;
    }

    const policy = row.rateLimits[scope.endpoint];
    return isRateLimitPolicy(policy) ? policy : null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRateLimitPolicy(value: unknown): value is RateLimitPolicy {
  return (
    isRecord(value) &&
    isPositiveInteger(value.windowMs) &&
    isPositiveInteger(value.siteActionLimit) &&
    isPositiveInteger(value.sessionActionLimit) &&
    isPositiveInteger(value.networkLimit)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
