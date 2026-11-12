import assert from "node:assert/strict";
import test from "node:test";

import { mapRiskBandToPolicy } from "./index.js";

test("maps every risk band through the supplied action policy", () => {
  const policy = {
    lowRiskDecision: "allow",
    elevatedRiskDecision: "challenge",
    highRiskDecision: "cooldown",
    severeRiskDecision: "block",
  } as const;

  assert.equal(mapRiskBandToPolicy("low", policy), "allow");
  assert.equal(mapRiskBandToPolicy("elevated", policy), "challenge");
  assert.equal(mapRiskBandToPolicy("high", policy), "cooldown");
  assert.equal(mapRiskBandToPolicy("severe", policy), "block");
});

test("allows sensitive actions to choose stricter low-risk mapping", () => {
  const recoveryPolicy = {
    lowRiskDecision: "challenge",
    elevatedRiskDecision: "challenge",
    highRiskDecision: "cooldown",
    severeRiskDecision: "block",
  } as const;

  assert.equal(mapRiskBandToPolicy("low", recoveryPolicy), "challenge");
});
