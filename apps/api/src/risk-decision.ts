import { randomUUID } from "node:crypto";

import {
  applyRiskFeatureSummary,
  createRiskFeatureSummary,
  evaluateDeterministicRiskRules,
  evaluateRiskPolicyMode,
  normalizeRiskDecisionContext,
  recordRiskFeatureEvent,
  type RiskFeatureSummary,
} from "@tracecaptcha/risk-engine";
import type {
  PolicyDecision,
  ProtectedAction,
  SiteActionPolicyDecisions,
} from "@tracecaptcha/shared-types";
import {
  authenticateBrowserSite,
  type AuthenticatedBrowserSite,
  type BrowserSiteCredentialLookup,
} from "./site-authentication.js";
import type { RateLimiter } from "./rate-limit.js";
import {
  type OperationalMetricName,
  type OperationalMetricsRecorder,
} from "./operational-metrics.js";

export type RiskFeatureSummaryStore = {
  read(scope: {
    siteId: string;
    action: string;
    sessionReference: string | null;
  }): Promise<RiskFeatureSummary | null>;
  write(summary: RiskFeatureSummary): Promise<void>;
};
export type RiskPolicyLookup = {
  findActive(
    siteId: string,
    action: ProtectedAction,
  ): Promise<SiteActionPolicyDecisions | null>;
};
export type RiskDecisionResult =
  | { outcome: "decided"; decisionId: string; decision: PolicyDecision }
  | { outcome: "invalid_site" }
  | { outcome: "rate_limited"; retryAfterSeconds: number }
  | { outcome: "unavailable" };

export class RiskDecisionService {
  public constructor(
    private readonly credentials: BrowserSiteCredentialLookup,
    private readonly featureStore: RiskFeatureSummaryStore,
    private readonly policies: RiskPolicyLookup,
    private readonly now: () => Date = () => new Date(),
    private readonly rateLimiter?: RateLimiter,
    private readonly metrics?: OperationalMetricsRecorder,
  ) {}
  public async decide(input: {
    siteKey: unknown;
    origin: unknown;
    action: ProtectedAction;
    sessionId?: string;
    attemptId?: string;
    networkAddress?: string;
  }): Promise<RiskDecisionResult> {
    let site: AuthenticatedBrowserSite | null;

    try {
      site = await authenticateBrowserSite(
        input.siteKey,
        input.origin,
        this.credentials,
        this.now(),
      );
    } catch {
      return { outcome: "unavailable" };
    }

    if (site === null) return { outcome: "invalid_site" };

    try {
      const limit = await this.rateLimiter?.consume({
        endpoint: "decision",
        customerId: site.customerId,
        siteId: site.siteId,
        action: input.action,
        sessionId: input.sessionId ?? null,
        networkAddress: input.networkAddress ?? null,
      });
      if (limit !== undefined && !limit.allowed) {
        return {
          outcome: "rate_limited",
          retryAfterSeconds: limit.retryAfterSeconds,
        };
      }
      const context = normalizeRiskDecisionContext({
        action: input.action,
        siteId: site.siteId,
        sessionReference: input.sessionId,
        attemptReference: input.attemptId,
      });
      const policy = await this.policies.findActive(site.siteId, input.action);
      if (policy === null) {
        recordDependencyUnavailable(this.metrics, site, input.action);
        return { outcome: "unavailable" };
      }
      const summary = await this.featureStore.read({
        siteId: site.siteId,
        action: input.action,
        sessionReference: context.sessionReference,
      });
      const assessment = evaluateDeterministicRiskRules(
        applyRiskFeatureSummary(context, summary, this.now()),
      );
      const updated = recordRiskFeatureEvent(
        summary ?? createRiskFeatureSummary(context, this.now()),
        "decision_request",
        this.now(),
      );
      await this.featureStore.write(updated);
      const result = {
        outcome: "decided",
        decisionId: `dec_${randomUUID()}`,
        decision: evaluateRiskPolicyMode("enforce", assessment.riskBand, policy)
          .decision,
      } as const;

      recordMetric(this.metrics, {
        customerId: site.customerId,
        siteId: site.siteId,
        action: input.action,
        name: decisionMetricName(result.decision),
      });

      return result;
    } catch {
      recordDependencyUnavailable(this.metrics, site, input.action);
      return { outcome: "unavailable" };
    }
  }
}

function decisionMetricName(decision: PolicyDecision): OperationalMetricName {
  return `decision_${decision}` as OperationalMetricName;
}

function recordMetric(
  recorder: OperationalMetricsRecorder | undefined,
  metric: Parameters<OperationalMetricsRecorder["record"]>[0],
): void {
  void recorder?.record(metric).catch(() => undefined);
}

function recordDependencyUnavailable(
  recorder: OperationalMetricsRecorder | undefined,
  site: AuthenticatedBrowserSite,
  action: ProtectedAction,
): void {
  recordMetric(recorder, {
    customerId: site.customerId,
    siteId: site.siteId,
    action,
    name: "dependency_unavailable",
  });
}
