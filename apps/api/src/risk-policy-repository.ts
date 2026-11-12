import type { Pool } from "pg";

import type {
  ProtectedAction,
  SiteActionPolicyDecisions,
} from "@tracecaptcha/shared-types";

import type { RiskPolicyLookup } from "./risk-decision.js";

export class PostgresRiskPolicyLookup implements RiskPolicyLookup {
  public constructor(private readonly database: Pick<Pool, "query">) {}

  public async findActive(
    siteId: string,
    action: ProtectedAction,
  ): Promise<SiteActionPolicyDecisions | null> {
    const result = await this.database.query<SiteActionPolicyDecisions>(
      `SELECT low_risk_decision AS "lowRiskDecision", elevated_risk_decision AS "elevatedRiskDecision", high_risk_decision AS "highRiskDecision", severe_risk_decision AS "severeRiskDecision" FROM tracecaptcha_site_action_policies WHERE site_id = $1 AND action = $2 AND status = 'active' ORDER BY version DESC LIMIT 1`,
      [siteId, action],
    );
    return result.rows[0] ?? null;
  }
}
