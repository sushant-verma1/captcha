import assert from "node:assert/strict";
import test from "node:test";

import type { ChallengeState } from "./challenge-state.js";
import {
  createChallengeExpiry,
  defaultChallengeLifetimeMs,
  RedisChallengeStore,
} from "./challenge-store.js";

test("uses the approved two-minute challenge lifetime", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");

  assert.equal(createChallengeExpiry(now), "2026-11-10T12:02:00.000Z");
  assert.equal(defaultChallengeLifetimeMs, 120_000);
});

test("consumes a challenge exactly once while preserving server bindings", async () => {
  const clock = new MutableClock("2026-11-10T12:00:00.000Z");
  const store = new RedisChallengeStore(new InMemoryRedisClient(), clock.now);
  const challenge = createChallenge(clock.now());

  assert.equal(await store.save(challenge), true);
  assert.equal(await store.save(challenge), false);

  const results = await Promise.all(
    Array.from({ length: 8 }, () => store.consume(challenge.id)),
  );
  const consumed = results.filter((result) => result.outcome === "consumed");

  assert.equal(consumed.length, 1);
  assert.deepEqual(consumed[0], {
    outcome: "consumed",
    challenge: { ...challenge, status: "consumed" },
  });
  assert.equal(
    results.filter((result) => result.outcome === "missing_or_consumed").length,
    7,
  );
});

test("rejects expired challenges even when their Redis value has not yet been removed", async () => {
  const clock = new MutableClock("2026-11-10T12:00:00.000Z");
  const store = new RedisChallengeStore(new InMemoryRedisClient(), clock.now);
  const challenge = createChallenge(clock.now());

  assert.equal(await store.save(challenge), true);
  clock.advance(defaultChallengeLifetimeMs + 1);

  assert.deepEqual(await store.consume(challenge.id), { outcome: "expired" });
  assert.deepEqual(await store.consume(challenge.id), {
    outcome: "missing_or_consumed",
  });
});

class MutableClock {
  private current: Date;

  public constructor(initial: string) {
    this.current = new Date(initial);
  }

  public now = (): Date => this.current;

  public advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

class InMemoryRedisClient {
  private readonly values = new Map<string, string>();

  public async set(
    key: string,
    value: string,
    options: { NX: true; PX: number },
  ): Promise<"OK" | null> {
    void options;

    if (this.values.has(key)) {
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

function createChallenge(now: Date): ChallengeState {
  return {
    id: "ch_123",
    customerId: "customer_123",
    siteId: "site_123",
    action: "signup",
    sessionId: "session_123",
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
          { x: 32, y: 22 },
          { x: 288, y: 22 },
          { x: 160, y: 198 },
        ],
      },
    },
    createdAt: now.toISOString(),
    expiresAt: createChallengeExpiry(now),
    status: "active",
  };
}
