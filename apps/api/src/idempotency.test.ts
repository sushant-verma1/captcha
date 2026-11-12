import assert from "node:assert/strict";
import test from "node:test";

import {
  idempotencyFingerprint,
  RedisIdempotencyStore,
} from "./idempotency.js";

test("replays a matching completed request without running its operation twice", async () => {
  const store = new RedisIdempotencyStore(new InMemoryRedis());
  let calls = 0;
  const scope = {
    customerId: "customer_123",
    siteId: "site_123",
    endpoint: "challenge_creation" as const,
    key: "request_123",
    fingerprint: idempotencyFingerprint({ action: "signup" }),
  };

  assert.deepEqual(
    await store.execute(scope, 120_000, async () => ({ challengeId: ++calls })),
    { kind: "created", value: { challengeId: 1 } },
  );
  assert.deepEqual(
    await store.execute(scope, 120_000, async () => ({ challengeId: ++calls })),
    { kind: "replayed", value: { challengeId: 1 } },
  );
  assert.equal(calls, 1);
});

test("rejects a reused key with a different request fingerprint", async () => {
  const store = new RedisIdempotencyStore(new InMemoryRedis());
  const scope = {
    customerId: "customer_123",
    siteId: "site_123",
    endpoint: "challenge_creation" as const,
    key: "request_123",
    fingerprint: idempotencyFingerprint({ action: "signup" }),
  };
  await store.execute(scope, 120_000, async () => ({ challengeId: "ch_123" }));

  assert.deepEqual(
    await store.execute(
      { ...scope, fingerprint: idempotencyFingerprint({ action: "login" }) },
      120_000,
      async () => ({ challengeId: "ch_456" }),
    ),
    { kind: "conflict" },
  );
});

class InMemoryRedis {
  private readonly values = new Map<string, string>();

  public async set(
    key: string,
    value: string,
    options: { NX?: true; PX: number },
  ): Promise<string | null> {
    if (options.NX === true && this.values.has(key)) return null;
    this.values.set(key, value);
    return "OK";
  }

  public async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  public async del(key: string): Promise<number> {
    return this.values.delete(key) ? 1 : 0;
  }
}
