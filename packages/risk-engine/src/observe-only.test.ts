import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateRiskPolicyMode,
  summarizeObserveOnlyDecisions,
} from "./index.js";

const policy = {
  lowRiskDecision: "allow",
  elevatedRiskDecision: "challenge",
  highRiskDecision: "cooldown",
  severeRiskDecision: "block",
} as const;

test("observe-only mode records a would-have decision but does not enforce it", () => {
  assert.deepEqual(evaluateRiskPolicyMode("observe_only", "elevated", policy), {
    mode: "observe_only",
    decision: "allow",
    wouldDecision: "challenge",
  });
  assert.deepEqual(evaluateRiskPolicyMode("enforce", "elevated", policy), {
    mode: "enforce",
    decision: "challenge",
    wouldDecision: null,
  });
});

test("summarizes only would-have decisions and customer-provided outcomes", () => {
  assert.deepEqual(
    summarizeObserveOnlyDecisions([
      {
        action: "signup",
        wouldDecision: "challenge",
        customerOutcome: "completed",
      },
      {
        action: "signup",
        wouldDecision: "cooldown",
        customerOutcome: "failed",
      },
      {
        action: "password_reset",
        wouldDecision: "challenge",
        customerOutcome: null,
      },
      {
        action: "login",
        wouldDecision: "allow",
        customerOutcome: "abandoned",
      },
    ]),
    {
      wouldChallengeCount: 2,
      completedCount: 1,
      failedCount: 1,
      abandonedCount: 1,
      outcomeUnavailableCount: 1,
    },
  );
});
