import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeRiskDecisionContext,
  RiskDecisionContextValidationError,
} from "./index.js";

test("normalizes approved decision context and makes absence explicit", () => {
  assert.deepEqual(
    normalizeRiskDecisionContext({ action: "signup", siteId: "site_123" }),
    {
      action: "signup",
      siteId: "site_123",
      sessionReference: null,
      attemptReference: null,
      requestCounters: { siteAction: null, sessionAction: null },
      recentFailures: { action: null, challenge: null },
      customerSignals: { priorAbuseReport: null },
    },
  );
});

test("retains only bounded approved server-derived signals", () => {
  assert.deepEqual(
    normalizeRiskDecisionContext({
      action: "password_reset",
      siteId: "site_123",
      sessionReference: "session_123",
      attemptReference: "attempt_123",
      requestCounters: { siteAction: 12, sessionAction: 3 },
      recentFailures: { action: 2, challenge: 1 },
      customerSignals: { priorAbuseReport: false },
    }),
    {
      action: "password_reset",
      siteId: "site_123",
      sessionReference: "session_123",
      attemptReference: "attempt_123",
      requestCounters: { siteAction: 12, sessionAction: 3 },
      recentFailures: { action: 2, challenge: 1 },
      customerSignals: { priorAbuseReport: false },
    },
  );
});

test("rejects unapproved, malformed, and out-of-range context values", () => {
  const invalidInputs = [
    { action: "signup", siteId: "site_123", browserScore: 100 },
    {
      action: "signup",
      siteId: "site_123",
      requestCounters: { siteAction: 1, extra: 2 },
    },
    {
      action: "signup",
      siteId: "site_123",
      recentFailures: { action: -1 },
    },
    {
      action: "signup",
      siteId: "site_123",
      customerSignals: { priorAbuseReport: "yes" },
    },
    { action: "", siteId: "site_123" },
    { action: "signup", siteId: [] },
  ];

  for (const input of invalidInputs) {
    assert.throws(
      () => normalizeRiskDecisionContext(input),
      RiskDecisionContextValidationError,
    );
  }
});
