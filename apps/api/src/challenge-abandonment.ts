import type { ProtectedAction } from "@tracecaptcha/shared-types";

import type { RedisChallengeStore } from "./challenge-store.js";
import type { OperationalMetricsRecorder } from "./operational-metrics.js";
import {
  authenticateBrowserSite,
  type BrowserSiteCredentialLookup,
} from "./site-authentication.js";

export type ChallengeAbandonmentResult =
  | { outcome: "recorded" }
  | { outcome: "ignored" }
  | { outcome: "invalid_site" }
  | { outcome: "unavailable" };

/**
 * Records a best-effort aggregate lifecycle signal. It never consumes a
 * challenge, changes verification eligibility, or retains the browser event.
 */
export class ChallengeAbandonmentService {
  public constructor(
    private readonly credentials: BrowserSiteCredentialLookup,
    private readonly challenges: RedisChallengeStore,
    private readonly metrics: OperationalMetricsRecorder,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async report(input: {
    siteKey: unknown;
    origin: unknown;
    challengeId: string;
    action: ProtectedAction;
  }): Promise<ChallengeAbandonmentResult> {
    let site;

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

    let observation;

    try {
      observation = await this.challenges.observeAbandonment(
        input.challengeId,
        {
          customerId: site.customerId,
          siteId: site.siteId,
          action: input.action,
        },
      );
    } catch {
      return { outcome: "unavailable" };
    }

    if (observation.outcome !== "observed") {
      return { outcome: "ignored" };
    }

    void this.metrics
      .record({
        customerId: site.customerId,
        siteId: site.siteId,
        action: input.action,
        name: "challenge_abandoned",
      })
      .catch(() => undefined);

    return { outcome: "recorded" };
  }
}
