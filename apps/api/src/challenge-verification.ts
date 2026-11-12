import type {
  ProtectedAction,
  TracePoint,
  VerificationResponse,
} from "@tracecaptcha/shared-types";

import type { RedisChallengeStore } from "./challenge-store.js";
import type { OperationalMetricsRecorder } from "./operational-metrics.js";
import type { RateLimiter } from "./rate-limit.js";
import {
  authenticateBrowserSite,
  type AuthenticatedBrowserSite,
  type BrowserSiteCredentialLookup,
} from "./site-authentication.js";
import {
  ChallengeIneligibleForTokenError,
  TokenSigningUnavailableError,
  VerificationTokenSigner,
} from "./token-signing.js";
import { calculateTraceGeometry } from "./trace-geometry.js";
import { calculateTraceNaturalness } from "./trace-naturalness.js";
import { normalizeTrace, TraceValidationError } from "./trace-normalization.js";
import { assessTrace } from "./trace-policy.js";

export type ChallengeVerificationResult =
  | { outcome: "verified"; response: VerificationResponse }
  | { outcome: "expired" }
  | { outcome: "consumed" }
  | { outcome: "invalid_site" }
  | { outcome: "invalid_challenge" }
  | { outcome: "rate_limited"; retryAfterSeconds: number }
  | { outcome: "unavailable" };

/**
 * Owns the server-authoritative verification boundary. Browser trace data is
 * treated as untrusted and is neither persisted nor used as a score supplied
 * by the client. A challenge is atomically consumed before trace assessment.
 */
export class ChallengeVerificationService {
  public constructor(
    private readonly credentials: BrowserSiteCredentialLookup,
    private readonly challenges: RedisChallengeStore,
    private readonly tokenSigner: VerificationTokenSigner,
    private readonly now: () => Date = () => new Date(),
    private readonly rateLimiter?: RateLimiter,
    private readonly metrics?: OperationalMetricsRecorder,
  ) {}

  public async verify(input: {
    siteKey: unknown;
    origin: unknown;
    challengeId: string;
    action: ProtectedAction;
    trace: readonly TracePoint[];
    networkAddress?: string;
  }): Promise<ChallengeVerificationResult> {
    let site: AuthenticatedBrowserSite | null;

    try {
      site = await authenticateBrowserSite(
        input.siteKey,
        input.origin,
        this.credentials,
        this.now(),
      );
    } catch {
      return { outcome: "unavailable" };
    }

    if (site === null) {
      return { outcome: "invalid_site" };
    }

    try {
      const limit = await this.rateLimiter?.consume({
        endpoint: "challenge_verification",
        customerId: site.customerId,
        siteId: site.siteId,
        action: input.action,
        sessionId: null,
        networkAddress: input.networkAddress ?? null,
      });

      if (limit !== undefined && !limit.allowed) {
        return {
          outcome: "rate_limited",
          retryAfterSeconds: limit.retryAfterSeconds,
        };
      }
    } catch {
      recordMetric(this.metrics, {
        customerId: site.customerId,
        siteId: site.siteId,
        action: input.action,
        name: "dependency_unavailable",
      });
      return { outcome: "unavailable" };
    }

    let consumed;

    try {
      consumed = await this.challenges.consume(input.challengeId);
    } catch {
      recordMetric(this.metrics, {
        customerId: site.customerId,
        siteId: site.siteId,
        action: input.action,
        name: "dependency_unavailable",
      });
      return { outcome: "unavailable" };
    }

    if (consumed.outcome === "expired") {
      recordMetric(this.metrics, {
        customerId: site.customerId,
        siteId: site.siteId,
        action: input.action,
        name: "challenge_expired",
      });
      return { outcome: "expired" };
    }

    if (consumed.outcome === "missing_or_consumed") {
      recordMetric(this.metrics, {
        customerId: site.customerId,
        siteId: site.siteId,
        action: input.action,
        name: "challenge_replayed",
      });
      return { outcome: "consumed" };
    }

    const challenge = consumed.challenge;

    if (
      challenge.customerId !== site.customerId ||
      challenge.siteId !== site.siteId ||
      challenge.action !== input.action
    ) {
      return { outcome: "invalid_challenge" };
    }

    let normalized;

    try {
      normalized = normalizeTrace(input.trace, {
        canvas: challenge.renderData.canvas,
        canonicalTarget: challenge.canonicalTarget,
      });
    } catch (error) {
      if (error instanceof TraceValidationError) {
        recordMetric(this.metrics, {
          customerId: site.customerId,
          siteId: site.siteId,
          action: input.action,
          name: "challenge_retry",
        });
        return {
          outcome: "verified",
          response: { decision: "retry", reasonCategory: "trace_not_accepted" },
        };
      }

      recordMetric(this.metrics, {
        customerId: site.customerId,
        siteId: site.siteId,
        action: input.action,
        name: "dependency_unavailable",
      });
      return { outcome: "unavailable" };
    }

    let assessment;

    try {
      assessment = assessTrace(
        calculateTraceGeometry(normalized),
        calculateTraceNaturalness(normalized),
      );
    } catch {
      recordMetric(this.metrics, {
        customerId: site.customerId,
        siteId: site.siteId,
        action: input.action,
        name: "dependency_unavailable",
      });
      return { outcome: "unavailable" };
    }

    if (assessment.outcome === "retry") {
      recordMetric(this.metrics, {
        customerId: site.customerId,
        siteId: site.siteId,
        action: input.action,
        name: "challenge_retry",
        durationMs: normalized.durationMs,
      });
      return {
        outcome: "verified",
        response: { decision: "retry", reasonCategory: "trace_not_accepted" },
      };
    }

    if (assessment.outcome === "escalate") {
      return {
        outcome: "verified",
        response: {
          decision: "cooldown",
          reasonCategory: "additional_verification_required",
        },
      };
    }

    try {
      const token = await this.tokenSigner.issueAcceptedChallengeToken({
        customerId: challenge.customerId,
        siteId: challenge.siteId,
        action: challenge.action,
        challengeId: challenge.id,
        audience: challenge.siteId,
        challengeExpiresAt: challenge.expiresAt,
      });
      recordMetric(this.metrics, {
        customerId: site.customerId,
        siteId: site.siteId,
        action: input.action,
        name: "challenge_completed",
        durationMs: normalized.durationMs,
      });
      return {
        outcome: "verified",
        response: {
          decision: "allow",
          verificationToken: token.token,
          expiresAt: token.expiresAt,
        },
      };
    } catch (error) {
      if (
        error instanceof TokenSigningUnavailableError ||
        error instanceof ChallengeIneligibleForTokenError
      ) {
        recordMetric(this.metrics, {
          customerId: site.customerId,
          siteId: site.siteId,
          action: input.action,
          name: "dependency_unavailable",
        });
        return { outcome: "unavailable" };
      }

      return { outcome: "unavailable" };
    }
  }
}

function recordMetric(
  recorder: OperationalMetricsRecorder | undefined,
  metric: Parameters<OperationalMetricsRecorder["record"]>[0],
): void {
  void recorder?.record(metric).catch(() => undefined);
}
