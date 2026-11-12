import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRiskFeatureSummary,
  createRiskFeatureSummary,
  evaluateDeterministicRiskRules,
  evaluateRiskPolicyMode,
  normalizeRiskDecisionContext,
  riskFeatureRetentionMilliseconds,
  RiskDecisionContextValidationError,
  type RiskPolicyMode,
} from "./index.js";

const now = new Date("2026-11-11T12:00:00.000Z");
const policy = {
  lowRiskDecision: "allow",
  elevatedRiskDecision: "challenge",
  highRiskDecision: "cooldown",
  severeRiskDecision: "block",
} as const;

function evaluate(
  input: Record<string, unknown>,
  mode: RiskPolicyMode = "enforce",
) {
  const context = normalizeRiskDecisionContext({
    action: "signup",
    siteId: "site_123",
    ...input,
  });
  const assessment = evaluateDeterministicRiskRules(context);

  return evaluateRiskPolicyMode(mode, assessment.riskBand, policy);
}

test("maps reproducible low through severe policy outcomes", () => {
  assert.deepEqual(evaluate({}), {
    mode: "enforce",
    decision: "allow",
    wouldDecision: null,
  });
  assert.deepEqual(evaluate({ requestCounters: { siteAction: 20 } }), {
    mode: "enforce",
    decision: "challenge",
    wouldDecision: null,
  });
  assert.deepEqual(evaluate({ recentFailures: { action: 3 } }), {
    mode: "enforce",
    decision: "cooldown",
    wouldDecision: null,
  });
  assert.deepEqual(evaluate({ recentFailures: { action: 3, challenge: 3 } }), {
    mode: "enforce",
    decision: "block",
    wouldDecision: null,
  });
});

test("preserves would-have challenge without enforcing it in observe-only mode", () => {
  assert.deepEqual(
    evaluate({ requestCounters: { siteAction: 20 } }, "observe_only"),
    {
      mode: "observe_only",
      decision: "allow",
      wouldDecision: "challenge",
    },
  );
});

test("treats missing or stale summaries as absent and rejects conflicting scope", () => {
  const baseContext = normalizeRiskDecisionContext({
    action: "signup",
    siteId: "site_123",
    sessionReference: "session_123",
  });
  const summary = createRiskFeatureSummary(baseContext, now);
  const expiredAt = new Date(now.getTime() + riskFeatureRetentionMilliseconds);

  assert.equal(
    evaluateDeterministicRiskRules(
      applyRiskFeatureSummary(baseContext, null, now),
    ).riskBand,
    "low",
  );
  assert.equal(
    evaluateDeterministicRiskRules(
      applyRiskFeatureSummary(baseContext, summary, expiredAt),
    ).riskBand,
    "low",
  );
  assert.throws(
    () =>
      applyRiskFeatureSummary(
        { ...baseContext, siteId: "site_other" },
        summary,
        now,
      ),
    RiskDecisionContextValidationError,
  );
});
