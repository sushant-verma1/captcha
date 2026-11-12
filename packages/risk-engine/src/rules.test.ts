import assert from "node:assert/strict";
import test from "node:test";

import {
  deterministicRiskRuleVersion,
  evaluateDeterministicRiskRules,
  normalizeRiskDecisionContext,
} from "./index.js";

function context(input: Record<string, unknown> = {}) {
  return normalizeRiskDecisionContext({
    action: "signup",
    siteId: "site_123",
    ...input,
  });
}

test("returns a versioned low-risk result without signals", () => {
  assert.deepEqual(evaluateDeterministicRiskRules(context()), {
    version: deterministicRiskRuleVersion,
    riskBand: "low",
    matchedRules: [],
  });
});

test("raises elevated risk for conservative individual signals", () => {
  const assessment = evaluateDeterministicRiskRules(
    context({
      action: "password_reset",
      requestCounters: { siteAction: 20 },
      customerSignals: { priorAbuseReport: true },
    }),
    { outcome: null, traceAssessment: "retry" },
  );

  assert.equal(assessment.riskBand, "elevated");
  assert.deepEqual(
    assessment.matchedRules.map((rule) => rule.id),
    [
      "action_sensitivity_recovery_v1",
      "request_velocity_site_v1",
      "customer_abuse_signal_v1",
      "trace_retry_v1",
    ],
  );
});

test("requires two independent high signals before severe risk", () => {
  const oneHighSignal = evaluateDeterministicRiskRules(
    context({ recentFailures: { action: 3 } }),
  );
  const twoHighSignals = evaluateDeterministicRiskRules(
    context({ recentFailures: { action: 3, challenge: 3 } }),
    { outcome: "replayed", traceAssessment: null },
  );

  assert.equal(oneHighSignal.riskBand, "high");
  assert.equal(twoHighSignals.riskBand, "severe");
  assert.deepEqual(
    twoHighSignals.matchedRules.map((rule) => rule.id),
    [
      "recent_action_failures_v1",
      "recent_challenge_failures_v1",
      "challenge_lifecycle_failure_v1",
    ],
  );
});
