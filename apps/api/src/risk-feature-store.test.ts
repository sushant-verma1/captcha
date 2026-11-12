import assert from "node:assert/strict";
import test from "node:test";

import { createRiskFeatureSummary } from "@tracecaptcha/risk-engine";

import {
  RedisRiskFeatureSummaryStore,
  type RedisRiskFeatureClient,
} from "./risk-feature-store.js";

test("stores only a TTL-bound summary under a key that does not expose the session reference", async () => {
  const redis = new InMemoryRedis();
  const now = new Date("2026-11-11T12:00:00.000Z");
  const store = new RedisRiskFeatureSummaryStore(redis, () => now);
  const summary = createRiskFeatureSummary(
    {
      siteId: "site_123",
      action: "signup",
      sessionReference: "session_123",
    },
    now,
  );

  await store.write(summary);

  assert.equal(redis.lastKey?.includes("session_123"), false);
  assert.equal(redis.lastTtl, 15 * 60 * 1_000);
  assert.deepEqual(
    await store.read({
      siteId: "site_123",
      action: "signup",
      sessionReference: "session_123",
    }),
    summary,
  );
});

test("does not resurrect expired or mismatched feature summaries", async () => {
  const redis = new InMemoryRedis();
  const now = new Date("2026-11-11T12:00:00.000Z");
  const store = new RedisRiskFeatureSummaryStore(redis, () => now);
  const expired = createRiskFeatureSummary(
    {
      siteId: "site_123",
      action: "signup",
      sessionReference: null,
    },
    new Date("2026-11-11T11:45:00.000Z"),
  );

  await store.write(expired);
  assert.equal(redis.lastKey, undefined);

  const summary = createRiskFeatureSummary(
    {
      siteId: "site_other",
      action: "signup",
      sessionReference: null,
    },
    now,
  );
  redis.value = JSON.stringify(summary);

  assert.equal(
    await store.read({
      siteId: "site_123",
      action: "signup",
      sessionReference: null,
    }),
    null,
  );
});

class InMemoryRedis implements RedisRiskFeatureClient {
  public value: string | null = null;
  public lastKey: string | undefined;
  public lastTtl: number | undefined;

  public async get(_key: string): Promise<string | null> {
    return this.value;
  }

  public async set(
    key: string,
    value: string,
    options: { PX: number },
  ): Promise<"OK"> {
    this.lastKey = key;
    this.lastTtl = options.PX;
    this.value = value;
    return "OK";
  }
}
