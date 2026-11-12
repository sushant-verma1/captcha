import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";

import { PostgresRateLimitPolicyLookup } from "./rate-limit-policy-repository.js";

test("loads the active endpoint policy for the requested site and action", async () => {
  let statement = "";
  let values: readonly unknown[] = [];
  const policies = new PostgresRateLimitPolicyLookup({
    async query(query: string, parameters?: readonly unknown[]) {
      statement = query;
      values = parameters ?? [];
      return {
        rows: [
          {
            rateLimits: {
              decision: {
                windowMs: 60_000,
                siteActionLimit: 120,
                sessionActionLimit: 20,
                networkLimit: 240,
              },
            },
          },
        ],
      };
    },
  } as unknown as Pick<Pool, "query">);

  assert.deepEqual(
    await policies.find({
      endpoint: "decision",
      customerId: "customer_123",
      siteId: "site_123",
      action: "signup",
      sessionId: null,
      networkAddress: null,
    }),
    {
      windowMs: 60_000,
      siteActionLimit: 120,
      sessionActionLimit: 20,
      networkLimit: 240,
    },
  );
  assert.match(statement, /rate_limits/);
  assert.match(statement, /status = 'active'/);
  assert.deepEqual(values, ["site_123", "signup"]);
});

test("fails closed for missing or malformed endpoint policies", async () => {
  const policies = new PostgresRateLimitPolicyLookup({
    async query() {
      return { rows: [{ rateLimits: { decision: { windowMs: 0 } } }] };
    },
  } as unknown as Pick<Pool, "query">);

  assert.equal(
    await policies.find({
      endpoint: "challenge_creation",
      customerId: "customer_123",
      siteId: "site_123",
      action: "signup",
      sessionId: null,
      networkAddress: null,
    }),
    null,
  );
});
