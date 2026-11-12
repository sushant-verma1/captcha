import assert from "node:assert/strict";
import test from "node:test";

import type { AppConfig } from "./config.js";
import { issueSiteCredential } from "./credentials.js";
import { FalsePositiveReportingService } from "./false-positive-reporting.js";
import type { OperationalMetric } from "./operational-metrics.js";
import { buildServer } from "./server.js";
import type { ServerSiteCredentialRecord } from "./site-authentication.js";

test("records one aggregate-only false-positive report for an authenticated server site", async () => {
  const credential = await issueSiteCredential({
    siteId: "site_123",
    kind: "private_server_credential",
  });
  const metrics: OperationalMetric[] = [];
  const service = new FalsePositiveReportingService(
    {
      async findByKeyId(keyId): Promise<ServerSiteCredentialRecord | null> {
        return keyId === credential.record.keyId
          ? {
              ...credential.record,
              customerId: "customer_123",
              environmentId: "environment_123",
            }
          : null;
      },
    },
    {
      async record(metric) {
        metrics.push(metric);
      },
    },
  );

  assert.deepEqual(
    await service.report({
      secretKey: credential.credential,
      action: "signup",
    }),
    { outcome: "recorded" },
  );
  assert.deepEqual(metrics, [
    {
      customerId: "customer_123",
      siteId: "site_123",
      action: "signup",
      name: "false_positive_reported",
    },
  ]);
});

test("rejects invalid private credentials without writing a false-positive report", async () => {
  const service = new FalsePositiveReportingService(
    {
      async findByKeyId() {
        return null;
      },
    },
    {
      async record() {
        throw new Error("must not write");
      },
    },
  );

  assert.deepEqual(
    await service.report({ secretKey: "invalid", action: "signup" }),
    { outcome: "invalid_secret_key" },
  );
});

test("fails closed when aggregate storage is unavailable", async () => {
  const credential = await issueSiteCredential({
    siteId: "site_123",
    kind: "private_server_credential",
  });
  const service = new FalsePositiveReportingService(
    {
      async findByKeyId(keyId): Promise<ServerSiteCredentialRecord | null> {
        return keyId === credential.record.keyId
          ? {
              ...credential.record,
              customerId: "customer_123",
              environmentId: "environment_123",
            }
          : null;
      },
    },
    {
      async record() {
        throw new Error("database unavailable");
      },
    },
  );

  assert.deepEqual(
    await service.report({
      secretKey: credential.credential,
      action: "signup",
    }),
    { outcome: "unavailable" },
  );
});

test("accepts only an action from an authenticated backend report request", async () => {
  const credential = await issueSiteCredential({
    siteId: "site_123",
    kind: "private_server_credential",
  });
  const metrics: OperationalMetric[] = [];
  const reporter = new FalsePositiveReportingService(
    {
      async findByKeyId(keyId): Promise<ServerSiteCredentialRecord | null> {
        return keyId === credential.record.keyId
          ? {
              ...credential.record,
              customerId: "customer_123",
              environmentId: "environment_123",
            }
          : null;
      },
    },
    {
      async record(metric) {
        metrics.push(metric);
      },
    },
  );
  const server = buildServer(testConfig, { falsePositiveReporter: reporter });

  try {
    const accepted = await server.inject({
      method: "POST",
      url: "/v1/observability/false-positive-reports",
      headers: { "x-tracecaptcha-secret-key": credential.credential },
      payload: { action: "signup" },
    });
    const rejected = await server.inject({
      method: "POST",
      url: "/v1/observability/false-positive-reports",
      headers: { "x-tracecaptcha-secret-key": credential.credential },
      payload: { action: "signup", sessionId: "not-permitted" },
    });

    assert.equal(accepted.statusCode, 202);
    assert.equal(rejected.statusCode, 400);
    assert.deepEqual(metrics, [
      {
        customerId: "customer_123",
        siteId: "site_123",
        action: "signup",
        name: "false_positive_reported",
      },
    ]);
  } finally {
    await server.close();
  }
});

const testConfig: AppConfig = {
  environment: "test",
  host: "127.0.0.1",
  port: 3_000,
  logLevel: "fatal",
  redisUrl: "redis://127.0.0.1:6379",
  databaseUrl: "postgresql://tracecaptcha@127.0.0.1:5432/tracecaptcha",
  tokenSigning: {
    issuer: "https://tracecaptcha.example",
    keyConfig: {
      activeKeyId: "test_key_1",
      privateKeyPem: "test-only-not-loaded-by-this-server-fixture",
    },
  },
};
