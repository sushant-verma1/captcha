import assert from "node:assert/strict";
import test from "node:test";

import { PostgresOperationalMetricsRecorder } from "./operational-metrics.js";

test("records only a daily aggregate metric without request identifiers", async () => {
  const queries: Array<{
    text: string;
    values: readonly unknown[] | undefined;
  }> = [];
  const recorder = new PostgresOperationalMetricsRecorder({
    async query(text, values) {
      queries.push({ text, values });
      return { rows: [] };
    },
  });

  await recorder.record({
    customerId: "customer_123",
    siteId: "site_123",
    action: "signup",
    name: "challenge_completed",
    durationMs: 850,
  });

  assert.equal(queries.length, 1);
  assert.match(
    queries[0]?.text ?? "",
    /date_trunc\('day', CURRENT_TIMESTAMP\)/,
  );
  assert.match(queries[0]?.text ?? "", /ON CONFLICT/);
  assert.deepEqual(queries[0]?.values, [
    "customer_123",
    "site_123",
    "signup",
    "challenge_completed",
    850,
  ]);
  assert.equal((queries[0]?.text ?? "").includes("session_id"), false);
  assert.equal((queries[0]?.text ?? "").includes("trace_points"), false);
});

test("rejects invalid duration values before writing an aggregate metric", async () => {
  const recorder = new PostgresOperationalMetricsRecorder({
    async query() {
      throw new Error("must not write");
    },
  });

  await assert.rejects(
    recorder.record({
      customerId: "customer_123",
      siteId: "site_123",
      action: "signup",
      name: "challenge_completed",
      durationMs: -1,
    }),
    /Invalid operational metric/,
  );
});
