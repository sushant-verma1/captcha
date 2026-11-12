import { randomUUID } from "node:crypto";

import type { ProtectedAction } from "@tracecaptcha/shared-types";

import type { ChallengeResponse } from "@tracecaptcha/shared-types";

import {
  generatePolygonChallenge,
  createChallengeSeed,
} from "./challenge-generator.js";
import {
  createChallengeExpiry,
  defaultChallengeLifetimeMs,
  type RedisChallengeStore,
} from "./challenge-store.js";
import {
  idempotencyFingerprint,
  type IdempotencyStore,
} from "./idempotency.js";
import { toChallengeResponse, type ChallengeState } from "./challenge-state.js";
import {
  authenticateBrowserSite,
  type BrowserSiteCredentialLookup,
} from "./site-authentication.js";
import type { RateLimiter } from "./rate-limit.js";
import type { OperationalMetricsRecorder } from "./operational-metrics.js";

export type ChallengeCreationResult =
  | { outcome: "created"; response: ChallengeResponse }
  | { outcome: "invalid_site" }
  | { outcome: "idempotency_conflict" }
  | { outcome: "idempotency_in_progress" }
  | { outcome: "rate_limited"; retryAfterSeconds: number }
  | { outcome: "unavailable" };

export class ChallengeCreationService {
  public constructor(
    private readonly credentialLookup: BrowserSiteCredentialLookup,
    private readonly challengeStore: RedisChallengeStore,
    private readonly now: () => Date = () => new Date(),
    private readonly rateLimiter?: RateLimiter,
    private readonly idempotencyStore?: IdempotencyStore,
    private readonly metrics?: OperationalMetricsRecorder,
  ) {}

  public async create(input: {
    siteKey: unknown;
    origin: unknown;
    action: ProtectedAction;
    sessionId?: string;
    decisionId?: string;
    idempotencyKey?: string;
    networkAddress?: string;
  }): Promise<ChallengeCreationResult> {
    let site;

    try {
      site = await authenticateBrowserSite(
        input.siteKey,
        input.origin,
        this.credentialLookup,
        this.now(),
      );
    } catch {
      return { outcome: "unavailable" };
    }

    if (site === null) {
      return { outcome: "invalid_site" };
    }

    if (input.idempotencyKey !== undefined) {
      if (this.idempotencyStore === undefined) {
        recordDependencyUnavailable(this.metrics, site, input.action);
        return { outcome: "unavailable" };
      }

      try {
        const result = await this.idempotencyStore.execute(
          {
            customerId: site.customerId,
            siteId: site.siteId,
            endpoint: "challenge_creation",
            key: input.idempotencyKey,
            fingerprint: idempotencyFingerprint({
              action: input.action,
              sessionId: input.sessionId ?? null,
              decisionId: input.decisionId ?? null,
            }),
          },
          defaultChallengeLifetimeMs,
          async () => this.createForAuthenticatedSite(site, input),
        );

        if (result.kind === "conflict") {
          return { outcome: "idempotency_conflict" };
        }

        if (result.kind === "in_progress") {
          return { outcome: "idempotency_in_progress" };
        }

        if (!isChallengeCreationResult(result.value)) {
          recordDependencyUnavailable(this.metrics, site, input.action);
          return { outcome: "unavailable" };
        }

        if (result.kind === "replayed") {
          recordMetric(this.metrics, {
            customerId: site.customerId,
            siteId: site.siteId,
            action: input.action,
            name: "challenge_replayed",
          });
        }

        return result.value;
      } catch {
        recordDependencyUnavailable(this.metrics, site, input.action);
        return { outcome: "unavailable" };
      }
    }

    return this.createForAuthenticatedSite(site, input);
  }

  private async createForAuthenticatedSite(
    site: { customerId: string; siteId: string },
    input: {
      action: ProtectedAction;
      sessionId?: string;
      networkAddress?: string;
    },
  ): Promise<ChallengeCreationResult> {
    try {
      const limit = await this.rateLimiter?.consume({
        endpoint: "challenge_creation",
        customerId: site.customerId,
        siteId: site.siteId,
        action: input.action,
        sessionId: input.sessionId ?? null,
        networkAddress: input.networkAddress ?? null,
      });
      if (limit !== undefined && !limit.allowed) {
        return {
          outcome: "rate_limited",
          retryAfterSeconds: limit.retryAfterSeconds,
        };
      }
    } catch {
      recordDependencyUnavailable(this.metrics, site, input.action);
      return { outcome: "unavailable" };
    }

    const now = this.now();
    const generated = generatePolygonChallenge(createChallengeSeed());
    const challenge: ChallengeState = {
      id: `ch_${randomUUID()}`,
      customerId: site.customerId,
      siteId: site.siteId,
      action: input.action,
      ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      type: generated.type,
      difficulty: "standard",
      seed: generated.seed,
      canonicalTarget: generated.canonicalTarget,
      renderData: generated.renderData,
      createdAt: now.toISOString(),
      expiresAt: createChallengeExpiry(now),
      status: "active",
    };

    try {
      const wasStored = await this.challengeStore.save(challenge);

      if (!wasStored) {
        recordDependencyUnavailable(this.metrics, site, input.action);
        return { outcome: "unavailable" };
      }
    } catch {
      recordDependencyUnavailable(this.metrics, site, input.action);
      return { outcome: "unavailable" };
    }

    recordMetric(this.metrics, {
      customerId: site.customerId,
      siteId: site.siteId,
      action: input.action,
      name: "challenge_created",
    });

    return { outcome: "created", response: toChallengeResponse(challenge) };
  }
}

function recordMetric(
  recorder: OperationalMetricsRecorder | undefined,
  metric: Parameters<OperationalMetricsRecorder["record"]>[0],
): void {
  void recorder?.record(metric).catch(() => undefined);
}

function recordDependencyUnavailable(
  recorder: OperationalMetricsRecorder | undefined,
  site: { customerId: string; siteId: string },
  action: ProtectedAction,
): void {
  recordMetric(recorder, {
    customerId: site.customerId,
    siteId: site.siteId,
    action,
    name: "dependency_unavailable",
  });
}

function isChallengeCreationResult(
  value: unknown,
): value is ChallengeCreationResult {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const result = value as Record<string, unknown>;
  if (result.outcome === "created") {
    return result.response !== null && typeof result.response === "object";
  }

  if (result.outcome === "rate_limited") {
    return (
      typeof result.retryAfterSeconds === "number" &&
      Number.isSafeInteger(result.retryAfterSeconds) &&
      result.retryAfterSeconds > 0
    );
  }

  return result.outcome === "unavailable";
}
