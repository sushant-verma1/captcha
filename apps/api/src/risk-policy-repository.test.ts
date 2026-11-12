import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";

import { PostgresRiskPolicyLookup } from "./risk-policy-repository.js";

test("looks up only the active policy for the requested site and action", async () => {
  let statement = "";
  let values: readonly unknown[] = [];
  const database = {
    async query(query: string, parameters?: readonly unknown[]) {
      statement = query;
      values = parameters ?? [];
      return {
        rows: [
          {
            lowRiskDecision: "allow",
            elevatedRiskDecision: "challenge",
            highRiskDecision: "cooldown",
            severeRiskDecision: "block",
          },
        ],
      };
    },
  };
  const policies = new PostgresRiskPolicyLookup(
    database as unknown as Pick<Pool, "query">,
  );

  assert.deepEqual(await policies.findActive("site_123", "signup"), {
    lowRiskDecision: "allow",
    elevatedRiskDecision: "challenge",
    highRiskDecision: "cooldown",
    severeRiskDecision: "block",
  });
  assert.match(statement, /status = 'active'/);
  assert.match(statement, /site_id = \$1/);
  assert.match(statement, /action = \$2/);
  assert.deepEqual(values, ["site_123", "signup"]);
});
