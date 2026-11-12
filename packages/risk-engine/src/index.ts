import type {
  DecisionType,
  PolicyDecision,
  ProtectedAction,
  RiskBand,
  SiteActionPolicyDecisions,
} from "@tracecaptcha/shared-types";

const maximumActionLength = 100;
const maximumIdentifierLength = 255;
const maximumCount = 1_000_000;
export const riskFeatureRetentionMilliseconds = 15 * 60 * 1_000;

export type RiskDecisionContext = {
  action: ProtectedAction;
  siteId: string;
  sessionReference: string | null;
  attemptReference: string | null;
  requestCounters: {
    siteAction: number | null;
    sessionAction: number | null;
  };
  recentFailures: {
    action: number | null;
    challenge: number | null;
  };
  customerSignals: {
    priorAbuseReport: boolean | null;
  };
};

export type RiskDecisionContextInput = {
  action: unknown;
  siteId: unknown;
  sessionReference?: unknown;
  attemptReference?: unknown;
  requestCounters?: unknown;
  recentFailures?: unknown;
  customerSignals?: unknown;
};

export class RiskDecisionContextValidationError extends Error {
  public constructor() {
    super("Risk decision context is invalid.");
    this.name = "RiskDecisionContextValidationError";
  }
}

/**
 * Untrusted or partially available inputs are normalized before risk policy
 * evaluation. Browser callers never provide counters, failures, or customer
 * signals directly; those fields come from approved server-side collectors.
 */
export function normalizeRiskDecisionContext(
  input: unknown,
): RiskDecisionContext {
  const source = strictRecord(input, [
    "action",
    "siteId",
    "sessionReference",
    "attemptReference",
    "requestCounters",
    "recentFailures",
    "customerSignals",
  ]);

  return {
    action: requiredString(source.action, maximumActionLength),
    siteId: requiredString(source.siteId, maximumIdentifierLength),
    sessionReference: optionalIdentifier(
      source.sessionReference,
      maximumIdentifierLength,
    ),
    attemptReference: optionalIdentifier(
      source.attemptReference,
      maximumIdentifierLength,
    ),
    requestCounters: normalizedCounters(source.requestCounters),
    recentFailures: normalizedFailures(source.recentFailures),
    customerSignals: normalizedCustomerSignals(source.customerSignals),
  };
}

function normalizedCounters(
  value: unknown,
): RiskDecisionContext["requestCounters"] {
  const source = optionalStrictRecord(value, ["siteAction", "sessionAction"]);

  return {
    siteAction: optionalCount(source?.siteAction),
    sessionAction: optionalCount(source?.sessionAction),
  };
}

function normalizedFailures(
  value: unknown,
): RiskDecisionContext["recentFailures"] {
  const source = optionalStrictRecord(value, ["action", "challenge"]);

  return {
    action: optionalCount(source?.action),
    challenge: optionalCount(source?.challenge),
  };
}

function normalizedCustomerSignals(
  value: unknown,
): RiskDecisionContext["customerSignals"] {
  const source = optionalStrictRecord(value, ["priorAbuseReport"]);
  const priorAbuseReport = source?.priorAbuseReport;

  if (
    priorAbuseReport !== undefined &&
    priorAbuseReport !== null &&
    typeof priorAbuseReport !== "boolean"
  ) {
    throw new RiskDecisionContextValidationError();
  }

  return { priorAbuseReport: priorAbuseReport ?? null };
}

function strictRecord(
  value: unknown,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  const source = optionalStrictRecord(value, allowedKeys);

  if (source === undefined) {
    throw new RiskDecisionContextValidationError();
  }

  return source;
}

function optionalStrictRecord(
  value: unknown,
  allowedKeys: readonly string[],
): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).some((key) => !allowedKeys.includes(key))
  ) {
    throw new RiskDecisionContextValidationError();
  }

  return value as Record<string, unknown>;
}

function requiredString(value: unknown, maximumLength: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength
  ) {
    throw new RiskDecisionContextValidationError();
  }

  return value;
}

function optionalIdentifier(
  value: unknown,
  maximumLength: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return requiredString(value, maximumLength);
}

function optionalCount(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > maximumCount
  ) {
    throw new RiskDecisionContextValidationError();
  }

  return value;
}

export type RiskFeatureEvent =
  "decision_request" | "action_failure" | "challenge_failure";

/**
 * A TTL-bound aggregate. It deliberately contains counters only, never raw
 * browser events, trace points, credentials, or customer-provided content.
 */
export type RiskFeatureSummary = {
  siteId: string;
  action: ProtectedAction;
  sessionReference: string | null;
  expiresAt: string;
  siteActionRequests: number;
  sessionActionRequests: number | null;
  actionFailures: number;
  challengeFailures: number;
};

export class RiskFeatureStateExpiredError extends Error {
  public constructor() {
    super("Risk feature state has expired.");
    this.name = "RiskFeatureStateExpiredError";
  }
}

export function createRiskFeatureSummary(
  context: Pick<RiskDecisionContext, "siteId" | "action" | "sessionReference">,
  now: Date = new Date(),
): RiskFeatureSummary {
  return {
    siteId: context.siteId,
    action: context.action,
    sessionReference: context.sessionReference,
    expiresAt: new Date(
      now.getTime() + riskFeatureRetentionMilliseconds,
    ).toISOString(),
    siteActionRequests: 0,
    sessionActionRequests: context.sessionReference === null ? null : 0,
    actionFailures: 0,
    challengeFailures: 0,
  };
}

export function recordRiskFeatureEvent(
  summary: RiskFeatureSummary,
  event: RiskFeatureEvent,
  now: Date = new Date(),
): RiskFeatureSummary {
  if (isRiskFeatureSummaryExpired(summary, now)) {
    throw new RiskFeatureStateExpiredError();
  }

  switch (event) {
    case "decision_request":
      return {
        ...summary,
        siteActionRequests: increment(summary.siteActionRequests),
        sessionActionRequests:
          summary.sessionActionRequests === null
            ? null
            : increment(summary.sessionActionRequests),
      };
    case "action_failure":
      return {
        ...summary,
        actionFailures: increment(summary.actionFailures),
      };
    case "challenge_failure":
      return {
        ...summary,
        challengeFailures: increment(summary.challengeFailures),
      };
  }
}

export function applyRiskFeatureSummary(
  context: RiskDecisionContext,
  summary: RiskFeatureSummary | null,
  now: Date = new Date(),
): RiskDecisionContext {
  if (summary === null || isRiskFeatureSummaryExpired(summary, now)) {
    return {
      ...context,
      requestCounters: { siteAction: null, sessionAction: null },
      recentFailures: { action: null, challenge: null },
    };
  }

  if (
    summary.siteId !== context.siteId ||
    summary.action !== context.action ||
    summary.sessionReference !== context.sessionReference
  ) {
    throw new RiskDecisionContextValidationError();
  }

  return {
    ...context,
    requestCounters: {
      siteAction: summary.siteActionRequests,
      sessionAction: summary.sessionActionRequests,
    },
    recentFailures: {
      action: summary.actionFailures,
      challenge: summary.challengeFailures,
    },
  };
}

export function isRiskFeatureSummaryExpired(
  summary: RiskFeatureSummary,
  now: Date = new Date(),
): boolean {
  const expiresAt = Date.parse(summary.expiresAt);

  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
}

function increment(value: number): number {
  return Math.min(value + 1, maximumCount);
}

export const deterministicRiskRuleVersion = "deterministic-v1";

export type ChallengeRiskEvidence = {
  outcome: "expired" | "replayed" | null;
  traceAssessment: "pass" | "retry" | "escalate" | null;
};

export type RiskRuleOutcome = {
  id: string;
  riskBand: "elevated" | "high";
};

export type DeterministicRiskAssessment = {
  version: typeof deterministicRiskRuleVersion;
  riskBand: "low" | "elevated" | "high" | "severe";
  matchedRules: readonly RiskRuleOutcome[];
};

/**
 * Internal-only, calibration-required rules. They return a risk band rather
 * than a public decision and never treat a single behavior signal as proof of
 * automation. Callers supply only server-derived challenge evidence.
 */
export function evaluateDeterministicRiskRules(
  context: RiskDecisionContext,
  evidence: ChallengeRiskEvidence = { outcome: null, traceAssessment: null },
): DeterministicRiskAssessment {
  const matchedRules: RiskRuleOutcome[] = [];

  if (context.action === "password_reset" || context.action === "otp_request") {
    matchedRules.push({
      id: "action_sensitivity_recovery_v1",
      riskBand: "elevated",
    });
  }

  if ((context.requestCounters.siteAction ?? 0) >= 20) {
    matchedRules.push({ id: "request_velocity_site_v1", riskBand: "elevated" });
  }

  if ((context.requestCounters.sessionAction ?? 0) >= 6) {
    matchedRules.push({
      id: "request_velocity_session_v1",
      riskBand: "elevated",
    });
  }

  if ((context.recentFailures.action ?? 0) >= 3) {
    matchedRules.push({ id: "recent_action_failures_v1", riskBand: "high" });
  }

  if ((context.recentFailures.challenge ?? 0) >= 3) {
    matchedRules.push({
      id: "recent_challenge_failures_v1",
      riskBand: "high",
    });
  }

  if (context.customerSignals.priorAbuseReport === true) {
    matchedRules.push({
      id: "customer_abuse_signal_v1",
      riskBand: "elevated",
    });
  }

  if (evidence.outcome === "replayed" || evidence.outcome === "expired") {
    matchedRules.push({
      id: "challenge_lifecycle_failure_v1",
      riskBand: "high",
    });
  }

  if (evidence.traceAssessment === "retry") {
    matchedRules.push({ id: "trace_retry_v1", riskBand: "elevated" });
  }

  if (evidence.traceAssessment === "escalate") {
    matchedRules.push({ id: "trace_escalation_v1", riskBand: "high" });
  }

  const highSignalCount = matchedRules.filter(
    (rule) => rule.riskBand === "high",
  ).length;
  const riskBand =
    highSignalCount >= 2
      ? "severe"
      : highSignalCount === 1
        ? "high"
        : matchedRules.length > 0
          ? "elevated"
          : "low";

  return {
    version: deterministicRiskRuleVersion,
    riskBand,
    matchedRules,
  };
}

/**
 * Maps an internal band through a customer action policy. `retry` remains a
 * challenge-verification outcome, not an initial risk-policy decision.
 */
export function mapRiskBandToPolicy(
  riskBand: RiskBand,
  policy: SiteActionPolicyDecisions,
): PolicyDecision {
  switch (riskBand) {
    case "low":
      return policy.lowRiskDecision;
    case "elevated":
      return policy.elevatedRiskDecision;
    case "high":
      return policy.highRiskDecision;
    case "severe":
      return policy.severeRiskDecision;
  }
}

export type RiskPolicyMode = "enforce" | "observe_only";

export type RiskPolicyEvaluation = {
  mode: RiskPolicyMode;
  decision: PolicyDecision;
  wouldDecision: PolicyDecision | null;
};

/**
 * Observe-only mode always returns allow to the caller while retaining the
 * policy result for server-side aggregate evaluation. It must not be used for
 * a protected operation that requires enforcement.
 */
export function evaluateRiskPolicyMode(
  mode: RiskPolicyMode,
  riskBand: RiskBand,
  policy: SiteActionPolicyDecisions,
): RiskPolicyEvaluation {
  const mappedDecision = mapRiskBandToPolicy(riskBand, policy);

  return mode === "observe_only"
    ? { mode, decision: "allow", wouldDecision: mappedDecision }
    : { mode, decision: mappedDecision, wouldDecision: null };
}

export type CustomerActionOutcome = "completed" | "failed" | "abandoned";

/** Contains aggregate-safe values only; callers must not include raw context. */
export type ObserveOnlyDecisionRecord = {
  action: ProtectedAction;
  wouldDecision: PolicyDecision;
  customerOutcome: CustomerActionOutcome | null;
};

export type ObserveOnlyDecisionSummary = {
  wouldChallengeCount: number;
  completedCount: number;
  failedCount: number;
  abandonedCount: number;
  outcomeUnavailableCount: number;
};

export function summarizeObserveOnlyDecisions(
  records: readonly ObserveOnlyDecisionRecord[],
): ObserveOnlyDecisionSummary {
  return records.reduce<ObserveOnlyDecisionSummary>(
    (summary, record) => ({
      wouldChallengeCount:
        summary.wouldChallengeCount +
        (record.wouldDecision === "challenge" ? 1 : 0),
      completedCount:
        summary.completedCount +
        (record.customerOutcome === "completed" ? 1 : 0),
      failedCount:
        summary.failedCount + (record.customerOutcome === "failed" ? 1 : 0),
      abandonedCount:
        summary.abandonedCount +
        (record.customerOutcome === "abandoned" ? 1 : 0),
      outcomeUnavailableCount:
        summary.outcomeUnavailableCount +
        (record.customerOutcome === null ? 1 : 0),
    }),
    {
      wouldChallengeCount: 0,
      completedCount: 0,
      failedCount: 0,
      abandonedCount: 0,
      outcomeUnavailableCount: 0,
    },
  );
}

export type RiskDecision = {
  decision: DecisionType;
  reasonCategories: string[];
};
