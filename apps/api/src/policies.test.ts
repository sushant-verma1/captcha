import assert from "node:assert/strict";
import test from "node:test";

import { initialActionPolicyDefaults } from "./policies.js";

test("uses the approved conservative initial action policies", () => {
  assert.deepEqual(initialActionPolicyDefaults.signup, {
    lowRiskDecision: "allow",
    elevatedRiskDecision: "challenge",
    highRiskDecision: "cooldown",
    severeRiskDecision: "block",
  });
  assert.deepEqual(initialActionPolicyDefaults.login, {
    lowRiskDecision: "allow",
    elevatedRiskDecision: "challenge",
    highRiskDecision: "cooldown",
    severeRiskDecision: "block",
  });
  assert.deepEqual(initialActionPolicyDefaults.password_reset, {
    lowRiskDecision: "challenge",
    elevatedRiskDecision: "challenge",
    highRiskDecision: "cooldown",
    severeRiskDecision: "block",
  });
  assert.deepEqual(initialActionPolicyDefaults.otp_request, {
    lowRiskDecision: "challenge",
    elevatedRiskDecision: "challenge",
    highRiskDecision: "cooldown",
    severeRiskDecision: "block",
  });
});
