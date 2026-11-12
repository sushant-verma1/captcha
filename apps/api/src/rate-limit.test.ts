import assert from "node:assert/strict";
import test from "node:test";

import {
  RateLimiter,
  StaticRateLimitPolicyLookup,
  type RateLimitCounterStore,
} from "./rate-limit.js";

test("limits site, session, and network scopes independently", async () => {
  const counters = new InMemoryCounters();
  const limiter = new RateLimiter(
    counters,
    new StaticRateLimitPolicyLookup({
      decision: {
        windowMs: 60_000,
        siteActionLimit: 2,
        sessionActionLimit: 1,
        networkLimit: 3,
      },
      challenge_creation: {
        windowMs: 60_000,
        siteActionLimit: 2,
        sessionActionLimit: 1,
        networkLimit: 3,
      },
      challenge_verification: {
        windowMs: 60_000,
        siteActionLimit: 2,
        sessionActionLimit: 1,
        networkLimit: 3,
      },
    }),
  );
  const scope = {
    endpoint: "decision" as const,
    customerId: "customer_123",
    siteId: "site_123",
    action: "signup",
    sessionId: "session_123",
    networkAddress: "203.0.113.10",
  };

  assert.deepEqual(await limiter.consume(scope), { allowed: true });
  assert.deepEqual(await limiter.consume(scope), {
    allowed: false,
    retryAfterSeconds: 60,
  });
  assert.equal(
    [...counters.keys()].some((key) => key.includes(scope.sessionId)),
    false,
  );
  assert.equal(
    [...counters.keys()].some((key) => key.includes(scope.networkAddress)),
    false,
  );
});

test("keeps endpoint counters separate for the same customer site and action", async () => {
  const counters = new InMemoryCounters();
  const policies = new StaticRateLimitPolicyLookup({
    decision: {
      windowMs: 60_000,
      siteActionLimit: 1,
      sessionActionLimit: 1,
      networkLimit: 1,
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
  });
  const limiter = new RateLimiter(counters, policies);
  const scope = {
    customerId: "customer_123",
    siteId: "site_123",
    action: "signup" as const,
    sessionId: null,
    networkAddress: null,
  };

  assert.deepEqual(await limiter.consume({ ...scope, endpoint: "decision" }), {
    allowed: true,
  });
  assert.deepEqual(
    await limiter.consume({ ...scope, endpoint: "challenge_creation" }),
    { allowed: true },
  );
});

class InMemoryCounters implements RateLimitCounterStore {
  private readonly counts = new Map<string, number>();

  public async increment(
    key: string,
    _windowMs: number,
  ): Promise<{ count: number; ttlMs: number }> {
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return { count, ttlMs: 60_000 };
  }

  public keys(): IterableIterator<string> {
    return this.counts.keys();
  }
}
