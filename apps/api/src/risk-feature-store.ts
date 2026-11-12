import { createHash } from "node:crypto";

import type { RiskFeatureSummary } from "@tracecaptcha/risk-engine";
import type { ProtectedAction } from "@tracecaptcha/shared-types";

import type { RiskFeatureSummaryStore } from "./risk-decision.js";

export type RedisRiskFeatureClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { PX: number }): Promise<unknown>;
};

export class RedisRiskFeatureSummaryStore implements RiskFeatureSummaryStore {
  public constructor(
    private readonly client: RedisRiskFeatureClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async read(scope: {
    siteId: string;
    action: string;
    sessionReference: string | null;
  }): Promise<RiskFeatureSummary | null> {
    const value = await this.client.get(key(scope));
    if (value === null) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(value);
      return isRiskFeatureSummary(parsed) && matchesScope(parsed, scope)
        ? parsed
        : null;
    } catch {
      throw new Error("Stored risk feature state is invalid.");
    }
  }

  public async write(summary: RiskFeatureSummary): Promise<void> {
    const ttl = Date.parse(summary.expiresAt) - this.now().getTime();
    if (!Number.isFinite(ttl) || ttl <= 0) {
      return;
    }

    await this.client.set(key(summary), JSON.stringify(summary), { PX: ttl });
  }
}

function key(scope: {
  siteId: string;
  action: string;
  sessionReference: string | null;
}): string {
  const sessionHash = createHash("sha256")
    .update(scope.sessionReference ?? "none")
    .digest("base64url");
  return `tracecaptcha:risk-feature:${scope.siteId}:${scope.action}:${sessionHash}`;
}

function isRiskFeatureSummary(value: unknown): value is RiskFeatureSummary {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const summary = value as Record<string, unknown>;
  return (
    typeof summary.siteId === "string" &&
    isProtectedAction(summary.action) &&
    (typeof summary.sessionReference === "string" ||
      summary.sessionReference === null) &&
    typeof summary.expiresAt === "string" &&
    Number.isFinite(Date.parse(summary.expiresAt)) &&
    isNonNegativeInteger(summary.siteActionRequests) &&
    (summary.sessionActionRequests === null ||
      isNonNegativeInteger(summary.sessionActionRequests)) &&
    isNonNegativeInteger(summary.actionFailures) &&
    isNonNegativeInteger(summary.challengeFailures)
  );
}

function isProtectedAction(value: unknown): value is ProtectedAction {
  return (
    value === "signup" ||
    value === "login" ||
    value === "password_reset" ||
    value === "otp_request"
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function matchesScope(
  summary: RiskFeatureSummary,
  scope: { siteId: string; action: string; sessionReference: string | null },
): boolean {
  return (
    summary.siteId === scope.siteId &&
    summary.action === scope.action &&
    summary.sessionReference === scope.sessionReference
  );
}
