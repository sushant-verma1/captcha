import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRiskFeatureSummary,
  createRiskFeatureSummary,
  normalizeRiskDecisionContext,
  recordRiskFeatureEvent,
  riskFeatureRetentionMilliseconds,
  RiskDecisionContextValidationError,
  RiskFeatureStateExpiredError,
} from "./index.js";

const now = new Date("2026-11-11T12:00:00.000Z");
const context = normalizeRiskDecisionContext({
  action: "signup",
  siteId: "site_123",
  sessionReference: "session_123",
});

test("aggregates approved counter events without storing raw events", () => {
  let summary = createRiskFeatureSummary(context, now);
  summary = recordRiskFeatureEvent(summary, "decision_request", now);
  summary = recordRiskFeatureEvent(summary, "action_failure", now);
  summary = recordRiskFeatureEvent(summary, "challenge_failure", now);

  assert.deepEqual(applyRiskFeatureSummary(context, summary, now), {
    ...context,
    requestCounters: { siteAction: 1, sessionAction: 1 },
    recentFailures: { action: 1, challenge: 1 },
  });
  assert.deepEqual(Object.keys(summary).sort(), [
    "action",
    "actionFailures",
    "challengeFailures",
    "expiresAt",
    "sessionActionRequests",
    "sessionReference",
    "siteActionRequests",
    "siteId",
  ]);
});

test("uses a fixed expiry and removes stale aggregate signals", () => {
  const summary = createRiskFeatureSummary(context, now);
  const expiredAt = new Date(now.getTime() + riskFeatureRetentionMilliseconds);

  assert.throws(
    () => recordRiskFeatureEvent(summary, "decision_request", expiredAt),
    RiskFeatureStateExpiredError,
  );
  assert.deepEqual(applyRiskFeatureSummary(context, summary, expiredAt), {
    ...context,
    requestCounters: { siteAction: null, sessionAction: null },
    recentFailures: { action: null, challenge: null },
  });
});

test("does not apply a summary across site, action, or session scope", () => {
  const summary = createRiskFeatureSummary(context, now);

  assert.throws(
    () =>
      applyRiskFeatureSummary(
        { ...context, sessionReference: "other_session" },
        summary,
        now,
      ),
    RiskDecisionContextValidationError,
  );
});
