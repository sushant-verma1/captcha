import assert from "node:assert/strict";
import test from "node:test";

import type { AppConfig } from "./config.js";
import { ChallengeCreationService } from "./challenge-creation.js";
import { RedisChallengeStore } from "./challenge-store.js";
import { issueSiteCredential, type NewSiteCredential } from "./credentials.js";
import { RedisIdempotencyStore } from "./idempotency.js";
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

test("creates a browser-bound public challenge without exposing private state", async () => {
  const fixture = await createFixture();
  const server = buildServer(testConfig, {
    challengeCreator: fixture.challengeCreator,
  });

  try {
    const response = await server.inject({
      method: "POST",
      url: "/v1/challenges",
      headers: {
        "x-tracecaptcha-site-key": fixture.siteKey,
        origin: "https://app.example.com",
      },
      payload: { action: "signup", sessionId: "session_123" },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(
      response.headers["access-control-allow-origin"],
      "https://app.example.com",
    );
    assert.equal(response.json().action, "signup");
    assert.equal(response.json().renderData.target.kind, "polygon");
    assert.equal(response.body.includes("server-only"), false);
    assert.equal(response.body.includes("canonicalTarget"), false);
    assert.equal(fixture.redis.lastStored?.customerId, "customer_123");
    assert.equal(fixture.redis.lastStored?.siteId, "site_123");
    assert.equal(fixture.redis.lastStored?.sessionId, "session_123");
  } finally {
    await server.close();
  }
});

test("permits browser challenge preflight without issuing a challenge", async () => {
  const server = buildServer(testConfig);

  try {
    const response = await server.inject({
      method: "OPTIONS",
      url: "/v1/challenges",
      headers: { origin: "https://app.example.com" },
    });

    assert.equal(response.statusCode, 204);
    assert.equal(
      response.headers["access-control-allow-headers"],
      "Content-Type, X-TraceCAPTCHA-Site-Key, Idempotency-Key",
    );
  } finally {
    await server.close();
  }
});

test("rejects a copied site key from a different browser origin", async () => {
  const fixture = await createFixture();
  const server = buildServer(testConfig, {
    challengeCreator: fixture.challengeCreator,
  });

  try {
    const response = await server.inject({
      method: "POST",
      url: "/v1/challenges",
      headers: {
        "x-tracecaptcha-site-key": fixture.siteKey,
        origin: "https://attacker.example",
      },
      payload: { action: "signup" },
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: {
        code: "invalid_site_key",
        message: "The site key is missing or invalid.",
      },
    });
    assert.equal(fixture.redis.lastStored, undefined);
  } finally {
    await server.close();
  }
});

test("returns generic unavailable when site lookup fails", async () => {
  const issued = await issueSiteCredential({
    siteId: "site_123",
    kind: "public_site_key",
  });
  const failingLookup: BrowserSiteCredentialLookup = {
    async findByKeyId() {
      throw new Error("database unavailable");
    },
  };
  const service = new ChallengeCreationService(
    failingLookup,
    new RedisChallengeStore(new InMemoryRedis()),
  );
  const server = buildServer(testConfig, { challengeCreator: service });

  try {
    const response = await server.inject({
      method: "POST",
      url: "/v1/challenges",
      headers: {
        "x-tracecaptcha-site-key": issued.credential,
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

test("records a generic aggregate metric when authenticated challenge storage is unavailable", async () => {
  const issued = await issueSiteCredential({
    siteId: "site_123",
    kind: "public_site_key",
  });
  const metrics: OperationalMetric[] = [];
  const service = new ChallengeCreationService(
    {
      async findByKeyId(keyId): Promise<BrowserSiteCredentialRecord | null> {
        return keyId === issued.record.keyId
          ? browserCredential(issued.record)
          : null;
      },
    },
    new RedisChallengeStore({
      async set() {
        throw new Error("redis unavailable");
      },
      async getDel() {
        return null;
      },
    }),
    () => new Date("2026-11-11T12:00:00.000Z"),
    undefined,
    undefined,
    {
      async record(metric) {
        metrics.push(metric);
      },
    },
  );

  assert.deepEqual(
    await service.create({
      siteKey: issued.credential,
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

test("returns retry metadata when challenge creation is rate-limited", async () => {
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
          siteActionLimit: 1,
          sessionActionLimit: 1,
          networkLimit: 1,
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
  const server = buildServer(testConfig, {
    challengeCreator: fixture.challengeCreator,
  });

  try {
    const request = {
      method: "POST" as const,
      url: "/v1/challenges",
      headers: {
        "x-tracecaptcha-site-key": fixture.siteKey,
        origin: "https://app.example.com",
      },
      payload: { action: "signup", sessionId: "session_123" },
    };
    assert.equal((await server.inject(request)).statusCode, 201);

    const response = await server.inject(request);
    assert.equal(response.statusCode, 429);
    assert.equal(response.headers["retry-after"], "60");
    assert.deepEqual(response.json(), {
      error: {
        code: "rate_limited",
        message: "Too many requests. Please try again later.",
      },
    });
  } finally {
    await server.close();
  }
});

test("replays a matching challenge request and rejects changed idempotency reuse", async () => {
  const metrics: OperationalMetric[] = [];
  const fixture = await createFixture(undefined, true, {
    async record(metric) {
      metrics.push(metric);
    },
  });
  const server = buildServer(testConfig, {
    challengeCreator: fixture.challengeCreator,
  });
  const request = {
    method: "POST" as const,
    url: "/v1/challenges",
    headers: {
      "x-tracecaptcha-site-key": fixture.siteKey,
      "idempotency-key": "signup-attempt-123",
      origin: "https://app.example.com",
    },
    payload: {
      action: "signup",
      sessionId: "session_123",
      decisionId: "dec_123",
    },
  };

  try {
    const first = await server.inject(request);
    const replay = await server.inject(request);

    assert.equal(first.statusCode, 201);
    assert.equal(replay.statusCode, 201);
    assert.deepEqual(replay.json(), first.json());
    assert.equal(fixture.redis.challengeSaveCount, 1);
    assert.deepEqual(
      metrics.map((metric) => metric.name),
      ["challenge_created", "challenge_replayed"],
    );

    const conflict = await server.inject({
      ...request,
      payload: {
        action: "login",
        sessionId: "session_123",
        decisionId: "dec_123",
      },
    });
    assert.equal(conflict.statusCode, 409);
    assert.deepEqual(conflict.json(), {
      error: {
        code: "idempotency_conflict",
        message:
          "The idempotency key cannot be reused for a different request.",
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

async function createFixture(
  rateLimiter?: RateLimiter,
  useIdempotency = false,
  metrics?: { record(metric: OperationalMetric): Promise<void> },
): Promise<{
  siteKey: string;
  redis: InMemoryRedis;
  challengeCreator: ChallengeCreationService;
}> {
  const issued = await issueSiteCredential({
    siteId: "site_123",
    kind: "public_site_key",
  });
  const redis = new InMemoryRedis();
  const lookup: BrowserSiteCredentialLookup = {
    async findByKeyId(keyId) {
      if (keyId !== issued.record.keyId) {
        return null;
      }

      return browserCredential(issued.record);
    },
  };

  return {
    siteKey: issued.credential,
    redis,
    challengeCreator: new ChallengeCreationService(
      lookup,
      new RedisChallengeStore(
        redis,
        () => new Date("2026-11-11T12:00:00.000Z"),
      ),
      () => new Date("2026-11-11T12:00:00.000Z"),
      rateLimiter,
      useIdempotency ? new RedisIdempotencyStore(redis) : undefined,
      metrics,
    ),
  };
}

function browserCredential(
  credential: NewSiteCredential,
): BrowserSiteCredentialRecord {
  return {
    ...credential,
    customerId: "customer_123",
    environmentId: "environment_123",
    webHostnames: ["app.example.com"],
  };
}

class InMemoryRedis {
  private readonly values = new Map<string, string>();

  public lastStored: Record<string, unknown> | undefined;
  public challengeSaveCount = 0;

  public async set(
    key: string,
    value: string,
    options: { NX?: true; PX: number },
  ): Promise<string | null> {
    if (options.NX === true && this.values.has(key)) {
      return null;
    }

    this.values.set(key, value);
    if (key.startsWith("tracecaptcha:challenge:")) {
      this.lastStored = JSON.parse(value) as Record<string, unknown>;
      this.challengeSaveCount += 1;
    }
    return "OK";
  }

  public async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  public async del(key: string): Promise<number> {
    return this.values.delete(key) ? 1 : 0;
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
    _windowMs: number,
  ): Promise<{ count: number; ttlMs: number }> {
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return { count, ttlMs: 60_000 };
  }
}
