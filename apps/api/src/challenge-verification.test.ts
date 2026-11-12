import assert from "node:assert/strict";
import test from "node:test";

import { decodeProtectedHeader, generateKeyPair } from "jose";

import type { AppConfig } from "./config.js";
import { issueSiteCredential } from "./credentials.js";
import { ChallengeVerificationService } from "./challenge-verification.js";
import { RedisChallengeStore } from "./challenge-store.js";
import type { ChallengeState } from "./challenge-state.js";
import type { OperationalMetric } from "./operational-metrics.js";
import {
  RateLimiter,
  StaticRateLimitPolicyLookup,
  type RateLimitCounterStore,
} from "./rate-limit.js";
import { buildServer } from "./server.js";
import type {
  BrowserSiteCredentialLookup,
  BrowserSiteCredentialRecord,
} from "./site-authentication.js";
import { VerificationTokenSigner } from "./token-signing.js";

const now = new Date("2026-11-12T12:00:00.000Z");

test("verifies an authenticated trace server-side and issues an action-bound token", async () => {
  const fixture = await createFixture();
  await fixture.store.save(activeChallenge());
  const server = buildServer(testConfig, {
    challengeVerifier: fixture.service,
  });

  try {
    const response = await server.inject({
      method: "POST",
      url: "/v1/challenges/ch_123/verify",
      headers: {
        "x-tracecaptcha-site-key": fixture.siteKey,
        origin: "https://app.example.com",
      },
      payload: { action: "signup", trace: squareTrace() },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().decision, "allow");
    assert.equal(typeof response.json().verificationToken, "string");
    assert.deepEqual(decodeProtectedHeader(response.json().verificationToken), {
      alg: "EdDSA",
      typ: "tracecaptcha-verification+jwt",
      kid: "test_key_1",
    });
    assert.deepEqual(fixture.metrics, [
      {
        customerId: "customer_123",
        siteId: "site_123",
        action: "signup",
        name: "challenge_completed",
        durationMs: 100,
      },
    ]);

    const replay = await server.inject({
      method: "POST",
      url: "/v1/challenges/ch_123/verify",
      headers: {
        "x-tracecaptcha-site-key": fixture.siteKey,
        origin: "https://app.example.com",
      },
      payload: { action: "signup", trace: squareTrace() },
    });

    assert.equal(replay.statusCode, 409);
    assert.equal(replay.json().error.code, "challenge_consumed");
  } finally {
    await server.close();
  }
});

test("consumes a valid retry trace without issuing a token", async () => {
  const fixture = await createFixture();
  await fixture.store.save(activeChallenge());

  const result = await fixture.service.verify({
    siteKey: fixture.siteKey,
    origin: "https://app.example.com",
    challengeId: "ch_123",
    action: "signup",
    trace: [
      { x: 80, y: 55, t: 0 },
      { x: 240, y: 55, t: 100 },
    ],
  });

  assert.deepEqual(result, {
    outcome: "verified",
    response: { decision: "retry", reasonCategory: "trace_not_accepted" },
  });
  assert.deepEqual(fixture.metrics, [
    {
      customerId: "customer_123",
      siteId: "site_123",
      action: "signup",
      name: "challenge_retry",
      durationMs: 100,
    },
  ]);
  assert.deepEqual(
    await fixture.service.verify({
      siteKey: fixture.siteKey,
      origin: "https://app.example.com",
      challengeId: "ch_123",
      action: "signup",
      trace: squareTrace(),
    }),
    { outcome: "consumed" },
  );
});

test("rejects a wrong action after consumption without issuing a token", async () => {
  const fixture = await createFixture();
  await fixture.store.save(activeChallenge());

  assert.deepEqual(
    await fixture.service.verify({
      siteKey: fixture.siteKey,
      origin: "https://app.example.com",
      challengeId: "ch_123",
      action: "login",
      trace: squareTrace(),
    }),
    { outcome: "invalid_challenge" },
  );
  assert.deepEqual(fixture.metrics, []);
});

test("requires the browser origin to match the authenticated site", async () => {
  const fixture = await createFixture();
  await fixture.store.save(activeChallenge());

  assert.deepEqual(
    await fixture.service.verify({
      siteKey: fixture.siteKey,
      origin: "https://attacker.example",
      challengeId: "ch_123",
      action: "signup",
      trace: squareTrace(),
    }),
    { outcome: "invalid_site" },
  );
  assert.equal(
    await fixture.store.consume("ch_123").then((result) => result.outcome),
    "consumed",
  );
});

test("rate limits verification before consuming a second challenge", async () => {
  const fixture = await createFixture(
    new RateLimiter(
      new InMemoryRateLimitCounters(),
      new StaticRateLimitPolicyLookup({
        decision: {
          windowMs: 60_000,
          siteActionLimit: 10,
          sessionActionLimit: 10,
          networkLimit: 10,
        },
        challenge_creation: {
          windowMs: 60_000,
          siteActionLimit: 10,
          sessionActionLimit: 10,
          networkLimit: 10,
        },
        challenge_verification: {
          windowMs: 60_000,
          siteActionLimit: 1,
          sessionActionLimit: 1,
          networkLimit: 1,
        },
      }),
    ),
  );
  await fixture.store.save(activeChallenge());
  await fixture.store.save(activeChallenge("ch_456"));

  assert.equal(
    (
      await fixture.service.verify({
        siteKey: fixture.siteKey,
        origin: "https://app.example.com",
        challengeId: "ch_123",
        action: "signup",
        trace: squareTrace(),
        networkAddress: "203.0.113.10",
      })
    ).outcome,
    "verified",
  );
  assert.deepEqual(
    await fixture.service.verify({
      siteKey: fixture.siteKey,
      origin: "https://app.example.com",
      challengeId: "ch_456",
      action: "signup",
      trace: squareTrace(),
      networkAddress: "203.0.113.10",
    }),
    { outcome: "rate_limited", retryAfterSeconds: 60 },
  );
  assert.equal((await fixture.store.consume("ch_456")).outcome, "consumed");
});

async function createFixture(rateLimiter?: RateLimiter): Promise<{
  siteKey: string;
  store: RedisChallengeStore;
  service: ChallengeVerificationService;
  metrics: OperationalMetric[];
}> {
  const credential = await issueSiteCredential({
    siteId: "site_123",
    kind: "public_site_key",
  });
  const keyPair = await generateKeyPair("EdDSA");
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
  const signer = new VerificationTokenSigner({
    issuer: "https://tracecaptcha.example",
    keyProvider: {
      async getActiveSigningKey() {
        return {
          keyId: "test_key_1",
          sign: async (signingInput) =>
            new Uint8Array(
              await crypto.subtle.sign(
                "Ed25519",
                keyPair.privateKey,
                Uint8Array.from(signingInput),
              ),
            ),
        };
      },
    },
    now: () => now,
    tokenId: () => "token_123",
  });

  return {
    siteKey: credential.credential,
    store,
    service: new ChallengeVerificationService(
      lookup,
      store,
      signer,
      () => now,
      rateLimiter,
      {
        async record(metric) {
          metrics.push(metric);
        },
      },
    ),
    metrics,
  };
}

function activeChallenge(id: string = "ch_123"): ChallengeState {
  return {
    id,
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

function squareTrace() {
  return [
    { x: 80, y: 55, t: 0 },
    { x: 240, y: 55, t: 25 },
    { x: 240, y: 165, t: 50 },
    { x: 80, y: 165, t: 75 },
    { x: 80, y: 55, t: 100 },
  ];
}

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

  public async getDel(key: string): Promise<string | null> {
    const value = this.values.get(key) ?? null;
    this.values.delete(key);
    return value;
  }
}

class InMemoryRateLimitCounters implements RateLimitCounterStore {
  private readonly counts = new Map<string, number>();

  public async increment(
    key: string,
  ): Promise<{ count: number; ttlMs: number }> {
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return { count, ttlMs: 60_000 };
  }
}
