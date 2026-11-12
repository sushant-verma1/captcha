import assert from "node:assert/strict";
import test from "node:test";

import { toChallengeResponse, type ChallengeState } from "./challenge-state.js";

test("returns render data without server-authoritative challenge state", () => {
  const response = toChallengeResponse(challengeState);

  assert.deepEqual(response, {
    challengeId: "ch_123",
    action: "signup",
    renderData: {
      version: 1,
      canvas: { width: 320, height: 220 },
      target: {
        kind: "polygon",
        displayPath: [
          { x: 25, y: 25 },
          { x: 295, y: 25 },
          { x: 160, y: 195 },
        ],
      },
    },
    expiresAt: "2026-11-10T12:00:30.000Z",
  });
  assert.equal("customerId" in response, false);
  assert.equal("siteId" in response, false);
  assert.equal("seed" in response, false);
  assert.equal("canonicalTarget" in response, false);
  assert.equal("status" in response, false);
});

const challengeState: ChallengeState = {
  id: "ch_123",
  customerId: "customer_123",
  siteId: "site_123",
  action: "signup",
  type: "polygon",
  difficulty: "standard",
  seed: "server-only-seed",
  canonicalTarget: {
    type: "polygon",
    normalizedPath: [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.5, y: 0.9 },
    ],
  },
  renderData: {
    version: 1,
    canvas: { width: 320, height: 220 },
    target: {
      kind: "polygon",
      displayPath: [
        { x: 25, y: 25 },
        { x: 295, y: 25 },
        { x: 160, y: 195 },
      ],
    },
  },
  createdAt: "2026-11-10T12:00:00.000Z",
  expiresAt: "2026-11-10T12:00:30.000Z",
  status: "active",
};
