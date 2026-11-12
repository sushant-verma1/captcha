import { createHash } from "node:crypto";

import type { ProtectedAction } from "@tracecaptcha/shared-types";

export type RateLimitEndpoint =
  "decision" | "challenge_creation" | "challenge_verification";

export type RateLimitPolicy = {
  windowMs: number;
  siteActionLimit: number;
  sessionActionLimit: number;
  networkLimit: number;
};

export type RateLimitScope = {
  endpoint: RateLimitEndpoint;
  customerId: string;
  siteId: string;
  action: ProtectedAction;
  sessionId: string | null;
  networkAddress: string | null;
};

export type RateLimitCounterStore = {
  increment(
    key: string,
    windowMs: number,
  ): Promise<{ count: number; ttlMs: number }>;
};

export type RateLimitPolicyLookup = {
  find(scope: RateLimitScope): Promise<RateLimitPolicy | null>;
};

export type RateLimitResult =
  { allowed: true } | { allowed: false; retryAfterSeconds: number };

export class RateLimiter {
  public constructor(
    private readonly counters: RateLimitCounterStore,
    private readonly policies: RateLimitPolicyLookup,
  ) {}

  public async consume(scope: RateLimitScope): Promise<RateLimitResult> {
    const policy = await this.policies.find(scope);
    if (policy === null || !isPolicy(policy)) {
      throw new Error("Rate-limit policy is unavailable.");
    }

    const counters: Array<{
      kind: "site_action" | "session_action" | "network";
      limit: number;
    }> = [
      { kind: "site_action", limit: policy.siteActionLimit },
      ...(scope.sessionId === null
        ? []
        : [
            {
              kind: "session_action" as const,
              limit: policy.sessionActionLimit,
            },
          ]),
      ...(scope.networkAddress === null
        ? []
        : [{ kind: "network" as const, limit: policy.networkLimit }]),
    ];
    const results = await Promise.all(
      counters.map(async ({ kind, limit }) => ({
        limit,
        result: await this.counters.increment(
          key(scope, kind),
          policy.windowMs,
        ),
      })),
    );
    const rejected = results.filter(
      ({ limit, result }) => result.count > limit,
    );

    if (rejected.length === 0) {
      return { allowed: true };
    }

    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        ...rejected.map(({ result }) => Math.ceil(result.ttlMs / 1_000)),
      ),
    };
  }
}

export class StaticRateLimitPolicyLookup implements RateLimitPolicyLookup {
  public constructor(
    private readonly policies: Readonly<
      Record<RateLimitEndpoint, RateLimitPolicy>
    >,
  ) {}

  public async find(scope: RateLimitScope): Promise<RateLimitPolicy> {
    return this.policies[scope.endpoint];
  }
}

export const defaultRateLimitPolicies: Readonly<
  Record<RateLimitEndpoint, RateLimitPolicy>
> = {
  decision: {
    windowMs: 60_000,
    siteActionLimit: 120,
    sessionActionLimit: 20,
    networkLimit: 240,
  },
  challenge_creation: {
    windowMs: 60_000,
    siteActionLimit: 60,
    sessionActionLimit: 10,
    networkLimit: 120,
  },
  challenge_verification: {
    windowMs: 60_000,
    siteActionLimit: 60,
    sessionActionLimit: 8,
    networkLimit: 120,
  },
};

export type RedisRateLimitClient = {
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown>;
};

export class RedisRateLimitCounterStore implements RateLimitCounterStore {
  public constructor(private readonly client: RedisRateLimitClient) {}

  public async increment(
    counterKey: string,
    windowMs: number,
  ): Promise<{ count: number; ttlMs: number }> {
    const value = await this.client.eval(incrementScript, {
      keys: [counterKey],
      arguments: [String(windowMs)],
    });

    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      !isPositiveInteger(value[0]) ||
      !isPositiveInteger(value[1])
    ) {
      throw new Error("Rate-limit counter returned an invalid result.");
    }

    return { count: value[0], ttlMs: value[1] };
  }
}

function key(
  scope: RateLimitScope,
  kind: "site_action" | "session_action" | "network",
): string {
  const value =
    kind === "site_action"
      ? `${scope.customerId}:${scope.siteId}:${scope.action}`
      : kind === "session_action"
        ? `${scope.customerId}:${scope.siteId}:${scope.action}:${scope.sessionId}`
        : `${scope.customerId}:${scope.siteId}:${scope.action}:${scope.networkAddress}`;
  const digest = createHash("sha256").update(value).digest("base64url");
  return `tracecaptcha:rate-limit:${scope.endpoint}:${kind}:${digest}`;
}

function isPolicy(value: RateLimitPolicy): boolean {
  return (
    isPositiveInteger(value.windowMs) &&
    isPositiveInteger(value.siteActionLimit) &&
    isPositiveInteger(value.sessionActionLimit) &&
    isPositiveInteger(value.networkLimit)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

const incrementScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return { count, ttl }
`;
