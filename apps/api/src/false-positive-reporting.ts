import type { ProtectedAction } from "@tracecaptcha/shared-types";

import type { OperationalMetricsRecorder } from "./operational-metrics.js";
import {
  authenticateServerSite,
  type ServerSiteCredentialLookup,
} from "./site-authentication.js";

export type FalsePositiveReportResult =
  | { outcome: "recorded" }
  | { outcome: "invalid_secret_key" }
  | { outcome: "unavailable" };

/**
 * Accepts one aggregate-only report from a customer's trusted backend. This
 * boundary intentionally has no request, session, trace, token, score, rule,
 * or user-identifier fields.
 */
export class FalsePositiveReportingService {
  public constructor(
    private readonly credentialLookup: ServerSiteCredentialLookup,
    private readonly metrics: OperationalMetricsRecorder,
  ) {}

  public async report(input: {
    secretKey: unknown;
    action: ProtectedAction;
  }): Promise<FalsePositiveReportResult> {
    let site;

    try {
      site = await authenticateServerSite(
        input.secretKey,
        this.credentialLookup,
      );
    } catch {
      return { outcome: "unavailable" };
    }

    if (site === null) {
      return { outcome: "invalid_secret_key" };
    }

    try {
      await this.metrics.record({
        customerId: site.customerId,
        siteId: site.siteId,
        action: input.action,
        name: "false_positive_reported",
      });
      return { outcome: "recorded" };
    } catch {
      return { outcome: "unavailable" };
    }
  }
}
