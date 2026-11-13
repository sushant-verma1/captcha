import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, PoolClient } from "pg";
import {
  BootstrapError,
  loadBootstrapInput,
  provisionInitialTenant,
} from "./bootstrap.js";

test("provisions the first tenant with both credential classes and all initial policies", async () => {
  const database = createDatabase();

  const result = await provisionInitialTenant(database, {
    customerName: "TraceCAPTCHA staging",
    environmentName: "staging",
    siteName: "Staging web",
    webHostname: "staging.example.com",
  });

  assert.match(result.publicSiteKey, /^tc_site_/);
  assert.match(result.privateServerCredential, /^tc_server_/);
  assert.deepEqual(
    database.calls.slice(0, 3).map((call) => call.query),
    [
      "BEGIN",
      "SELECT pg_advisory_xact_lock($1)",
      'SELECT EXISTS (SELECT 1 FROM tracecaptcha_customers) AS "exists"',
    ],
  );
  assert.equal(
    database.calls.filter((call) =>
      call.query.startsWith("INSERT INTO tracecaptcha_site_credentials"),
    ).length,
    2,
  );
  assert.equal(
    database.calls.filter((call) =>
      call.query.startsWith("INSERT INTO tracecaptcha_site_action_policies"),
    ).length,
    4,
  );
  assert.equal(database.calls.at(-1)?.query, "COMMIT");
  assert.equal(database.released, true);
});

test("refuses bootstrap once a customer already exists and rolls back", async () => {
  const database = createDatabase({ exists: true });

  await assert.rejects(
    provisionInitialTenant(database, {
      customerName: "TraceCAPTCHA staging",
      environmentName: "staging",
      siteName: "Staging web",
      webHostname: "staging.example.com",
    }),
    BootstrapError,
  );

  assert.equal(
    database.calls.some((call) => call.query === "ROLLBACK"),
    true,
  );
  assert.equal(
    database.calls.some((call) => call.query.startsWith("INSERT INTO")),
    false,
  );
  assert.equal(database.released, true);
});

test("rolls back when writing the new credential file fails before commit", async () => {
  const database = createDatabase();

  await assert.rejects(
    provisionInitialTenant(
      database,
      {
        customerName: "TraceCAPTCHA staging",
        environmentName: "staging",
        siteName: "Staging web",
        webHostname: "staging.example.com",
      },
      async () => {
        throw new Error("secret file unavailable");
      },
    ),
    /secret file unavailable/,
  );

  assert.equal(database.calls.at(-1)?.query, "ROLLBACK");
  assert.equal(database.released, true);
});

test("requires deliberate configuration and a lowercase hostname-only value", () => {
  const environment = {
    TRACE_CAPTCHA_DATABASE_URL: "postgres://user:password@example.com:5432/db",
    TRACE_CAPTCHA_BOOTSTRAP_CONFIRM: "provision",
    TRACE_CAPTCHA_BOOTSTRAP_CUSTOMER_NAME: "TraceCAPTCHA staging",
    TRACE_CAPTCHA_BOOTSTRAP_ENVIRONMENT: "staging",
    TRACE_CAPTCHA_BOOTSTRAP_SITE_NAME: "Staging web",
    TRACE_CAPTCHA_BOOTSTRAP_WEB_HOSTNAME: "staging.example.com",
    TRACE_CAPTCHA_BOOTSTRAP_OUTPUT_PATH: "C:\\secrets\\tracecaptcha.json",
  };

  assert.deepEqual(loadBootstrapInput(environment).input, {
    customerName: "TraceCAPTCHA staging",
    environmentName: "staging",
    siteName: "Staging web",
    webHostname: "staging.example.com",
  });
  assert.throws(
    () =>
      loadBootstrapInput({
        ...environment,
        TRACE_CAPTCHA_BOOTSTRAP_CONFIRM: "yes",
      }),
    BootstrapError,
  );
  assert.throws(
    () =>
      loadBootstrapInput({
        ...environment,
        TRACE_CAPTCHA_BOOTSTRAP_WEB_HOSTNAME: "https://staging.example.com",
      }),
    BootstrapError,
  );
});

function createDatabase(options: { exists?: boolean } = {}) {
  const calls: Array<{ query: string; values: readonly unknown[] }> = [];
  let released = false;
  const client = {
    async query(query: string, values: readonly unknown[] = []) {
      calls.push({ query, values });
      return {
        rows: query.startsWith("SELECT EXISTS")
          ? [{ exists: options.exists ?? false }]
          : [],
      };
    },
    release() {
      released = true;
    },
  };

  return {
    calls,
    get released() {
      return released;
    },
    async connect() {
      return client as unknown as PoolClient;
    },
  } as Pick<Pool, "connect"> & {
    calls: typeof calls;
    readonly released: boolean;
  };
}
