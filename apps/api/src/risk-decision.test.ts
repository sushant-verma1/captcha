import assert from "node:assert/strict";
import test from "node:test";

import type { RiskFeatureSummary } from "@tracecaptcha/risk-engine";

import { issueSiteCredential } from "./credentials.js";
import { RiskDecisionService } from "./risk-decision.js";
import type { OperationalMetric } from "./operational-metrics.js";
import type { BrowserSiteCredentialRecord } from "./site-authentication.js";

test("authenticates a browser site and returns only the policy decision", async () => {
  const credential = await issueSiteCredential({
    siteId: "site_123",
    kind: "public_site_key",
  });
  let stored: RiskFeatureSummary | null = null;
  const metrics: OperationalMetric[] = [];
  const service = new RiskDecisionService(
    {
      async findByKeyId(keyId): Promise<BrowserSiteCredentialRecord | null> {
        return keyId === credential.record.keyId
          ? {
              ...credential.record,
              customerId: "customer_123",
              environmentId: "environment_123",
              webHostnames: ["app.example.com"],
            }
          : null;
      },
    },
    {
      async read() {
        return stored;
      },
      async write(summary) {
        stored = summary;
      },
    },
    {
      async findActive() {
        return {
          lowRiskDecision: "allow",
          elevatedRiskDecision: "challenge",
          highRiskDecision: "cooldown",
          severeRiskDecision: "block",
        };
      },
    },
    () => new Date("2026-11-11T12:00:00.000Z"),
    undefined,
    {
      async record(metric) {
        metrics.push(metric);
      },
    },
  );

  const result = await service.decide({
    siteKey: credential.credential,
    origin: "https://app.example.com",
    action: "signup",
    sessionId: "session_123",
  });

  assert.equal(result.outcome, "decided");
  assert.equal(result.outcome === "decided" && result.decision, "allow");
  assert.equal((stored as RiskFeatureSummary | null)?.siteActionRequests, 1);
  assert.deepEqual(metrics, [
    {
      customerId: "customer_123",
      siteId: "site_123",
      action: "signup",
      name: "decision_allow",
    },
  ]);
});

test("fails safely for invalid sites and unavailable policy dependencies", async () => {
  const unavailable = new RiskDecisionService(
    {
      async findByKeyId() {
        return null;
      },
    },
    {
      async read() {
        throw new Error("not reached");
      },
      async write() {},
    },
    {
      async findActive() {
        return null;
      },
    },
  );

  assert.deepEqual(
    await unavailable.decide({
      siteKey: "invalid",
      origin: "https://app.example.com",
      action: "signup",
    }),
    { outcome: "invalid_site" },
  );
});

test("records a generic aggregate metric when an authenticated dependency is unavailable", async () => {
  const credential = await issueSiteCredential({
    siteId: "site_123",
    kind: "public_site_key",
  });
  const metrics: OperationalMetric[] = [];
  const service = new RiskDecisionService(
    {
      async findByKeyId(keyId): Promise<BrowserSiteCredentialRecord | null> {
        return keyId === credential.record.keyId
          ? {
              ...credential.record,
              customerId: "customer_123",
              environmentId: "environment_123",
              webHostnames: ["app.example.com"],
            }
          : null;
      },
    },
    {
      async read() {
        throw new Error("not reached");
      },
      async write() {},
    },
    {
      async findActive() {
        throw new Error("database unavailable");
      },
    },
    undefined,
    undefined,
    {
      async record(metric) {
        metrics.push(metric);
      },
    },
  );

  assert.deepEqual(
    await service.decide({
      siteKey: credential.credential,
      origin: "https://app.example.com",
      action: "signup",
    }),
    { outcome: "unavailable" },
  );
  assert.deepEqual(metrics, [
    {
      customerId: "customer_123",
      siteId: "site_123",
      action: "signup",
      name: "dependency_unavailable",
    },
  ]);
});
