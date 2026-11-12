import assert from "node:assert/strict";
import test from "node:test";

import type { RiskFeatureSummary } from "@tracecaptcha/risk-engine";

import type { AppConfig } from "./config.js";
import { issueSiteCredential } from "./credentials.js";
import { RiskDecisionService } from "./risk-decision.js";
import { buildServer } from "./server.js";
import type { BrowserSiteCredentialRecord } from "./site-authentication.js";

test("returns an authenticated policy decision without exposing assessment details", async () => {
  const fixture = await createFixture(true);
  const server = buildServer(testConfig, {
    riskDecisionService: fixture.service,
  });

  try {
    const response = await server.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: {
        "x-tracecaptcha-site-key": fixture.siteKey,
        origin: "https://app.example.com",
      },
      payload: {
        action: "signup",
        sessionId: "session_123",
        context: { attemptId: "attempt_123" },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(
      response.headers["access-control-allow-origin"],
      "https://app.example.com",
    );
    assert.match(response.json().decisionId, /^dec_/);
    assert.equal(response.json().decision, "allow");
    assert.equal(response.body.includes("risk"), false);
    assert.equal(response.body.includes("rule"), false);
  } finally {
    await server.close();
  }
});

test("fails closed when no active policy is available", async () => {
  const fixture = await createFixture(false);
  const server = buildServer(testConfig, {
    riskDecisionService: fixture.service,
  });

  try {
    const response = await server.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: {
        "x-tracecaptcha-site-key": fixture.siteKey,
        origin: "https://app.example.com",
      },
      payload: { action: "signup" },
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), {
      error: {
        code: "service_unavailable",
        message: "Verification is temporarily unavailable. Please try again.",
      },
    });
  } finally {
    await server.close();
  }
});

test("rejects actions outside the agreed public action set", async () => {
  const fixture = await createFixture(true);
  const server = buildServer(testConfig, {
    riskDecisionService: fixture.service,
  });

  try {
    const response = await server.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: {
        "x-tracecaptcha-site-key": fixture.siteKey,
        origin: "https://app.example.com",
      },
      payload: { action: "account_delete" },
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: {
        code: "validation_error",
        message: "The request contains invalid fields.",
      },
    });
  } finally {
    await server.close();
  }
});

const testConfig: AppConfig = {
  environment: "test",
  host: "127.0.0.1",
  port: 3_000,
  logLevel: "fatal",
  redisUrl: "redis://127.0.0.1:6379",
  databaseUrl: "postgresql://tracecaptcha@127.0.0.1:5432/tracecaptcha",
  tokenSigning: {
    issuer: "https://tracecaptcha.example",
    keyConfig: {
      activeKeyId: "test_key_1",
      privateKeyPem: "test-only-not-loaded-by-this-server-fixture",
    },
  },
};

async function createFixture(hasActivePolicy: boolean): Promise<{
  siteKey: string;
  service: RiskDecisionService;
}> {
  const credential = await issueSiteCredential({
    siteId: "site_123",
    kind: "public_site_key",
  });
  let summary: RiskFeatureSummary | null = null;

  return {
    siteKey: credential.credential,
    service: new RiskDecisionService(
      {
        async findByKeyId(
          keyId: string,
        ): Promise<BrowserSiteCredentialRecord | null> {
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
          return summary;
        },
        async write(updated) {
          summary = updated;
        },
      },
      {
        async findActive() {
          return hasActivePolicy
            ? {
                lowRiskDecision: "allow",
                elevatedRiskDecision: "challenge",
                highRiskDecision: "cooldown",
                severeRiskDecision: "block",
              }
            : null;
        },
      },
      () => new Date("2026-11-11T12:00:00.000Z"),
    ),
  };
}
