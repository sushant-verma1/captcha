import assert from "node:assert/strict";
import test from "node:test";

import type { AppConfig } from "./config.js";
import { ChallengeAbandonmentService } from "./challenge-abandonment.js";
import { RedisChallengeStore } from "./challenge-store.js";
import type { ChallengeState } from "./challenge-state.js";
import { issueSiteCredential } from "./credentials.js";
import type { OperationalMetric } from "./operational-metrics.js";
import { buildServer } from "./server.js";
import type {
  BrowserSiteCredentialLookup,
  BrowserSiteCredentialRecord,
} from "./site-authentication.js";

const now = new Date("2026-11-15T12:00:00.000Z");

test("records one aggregate abandonment signal without consuming a challenge", async () => {
  const fixture = await createFixture();
  await fixture.store.save(activeChallenge());
  const server = buildServer(testConfig, {
    challengeAbandonmentReporter: fixture.service,
  });

  try {
    const request = {
      method: "POST" as const,
      url: "/v1/challenges/ch_123/abandonment",
      headers: {
        "x-tracecaptcha-site-key": fixture.siteKey,
        origin: "https://app.example.com",
      },
      payload: { action: "signup" },
    };

    assert.equal((await server.inject(request)).statusCode, 202);
    assert.equal((await server.inject(request)).statusCode, 202);
    assert.deepEqual(fixture.metrics, [
      {
        customerId: "customer_123",
        siteId: "site_123",
        action: "signup",
        name: "challenge_abandoned",
      },
    ]);
    assert.equal((await fixture.store.consume("ch_123")).outcome, "consumed");
  } finally {
    await server.close();
  }
});

test("ignores mismatched challenge bindings without suppressing a valid observation", async () => {
  const fixture = await createFixture();
  await fixture.store.save(activeChallenge());

  assert.deepEqual(
    await fixture.service.report({
      siteKey: fixture.siteKey,
      origin: "https://app.example.com",
      challengeId: "ch_123",
      action: "login",
    }),
    { outcome: "ignored" },
  );
  assert.deepEqual(fixture.metrics, []);
  assert.deepEqual(
    await fixture.service.report({
      siteKey: fixture.siteKey,
      origin: "https://app.example.com",
      challengeId: "ch_123",
      action: "signup",
    }),
    { outcome: "recorded" },
  );
});

test("rejects invalid browser credentials without recording an abandonment signal", async () => {
  const fixture = await createFixture();
  await fixture.store.save(activeChallenge());

  assert.deepEqual(
    await fixture.service.report({
      siteKey: "invalid",
      origin: "https://app.example.com",
      challengeId: "ch_123",
      action: "signup",
    }),
    { outcome: "invalid_site" },
  );
  assert.deepEqual(fixture.metrics, []);
});

async function createFixture(): Promise<{
  siteKey: string;
  store: RedisChallengeStore;
  service: ChallengeAbandonmentService;
  metrics: OperationalMetric[];
}> {
  const credential = await issueSiteCredential({
    siteId: "site_123",
    kind: "public_site_key",
  });
  const metrics: OperationalMetric[] = [];
  const store = new RedisChallengeStore(new InMemoryRedis(), () => now);
  const lookup: BrowserSiteCredentialLookup = {
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
  };

  return {
    siteKey: credential.credential,
    store,
    service: new ChallengeAbandonmentService(lookup, store, {
      async record(metric) {
        metrics.push(metric);
      },
    }),
    metrics,
  };
}

function activeChallenge(): ChallengeState {
  return {
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
        { x: 0.25, y: 0.25 },
        { x: 0.75, y: 0.25 },
        { x: 0.75, y: 0.75 },
        { x: 0.25, y: 0.75 },
      ],
    },
    renderData: {
      version: 1,
      canvas: { width: 320, height: 220 },
      target: {
        kind: "polygon",
        displayPath: [
          { x: 80, y: 55 },
          { x: 240, y: 55 },
          { x: 240, y: 165 },
          { x: 80, y: 165 },
        ],
      },
    },
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 120_000).toISOString(),
    status: "active",
  };
}

class InMemoryRedis {
  private readonly values = new Map<string, string>();

  public async set(
    key: string,
    value: string,
    options: { NX: true; PX: number },
  ): Promise<string | null> {
    if (options.NX && this.values.has(key)) {
      return null;
    }

    this.values.set(key, value);
    return "OK";
  }

  public async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  public async getDel(key: string): Promise<string | null> {
    const value = this.values.get(key) ?? null;
    this.values.delete(key);
    return value;
  }
}

const testConfig: AppConfig = {
  environment: "test",
  host: "127.0.0.1",
  port: 0,
  logLevel: "fatal",
  databaseUrl: "postgres://unused",
  redisUrl: "redis://unused",
  tokenSigning: {
    issuer: "https://tracecaptcha.example",
    keyConfig: {
      activeKeyId: "test_key_1",
      privateKeyPem: "test-only-not-loaded",
    },
  },
};
