import assert from "node:assert/strict";
import test from "node:test";

import {
  loadTestHarnessConfig,
  TestHarnessConfigurationError,
} from "./config.js";

const environment = {
  TRACE_CAPTCHA_TEST_HARNESS_API_ORIGIN: "https://captcha.example.test",
  TRACE_CAPTCHA_TEST_HARNESS_PUBLIC_ORIGIN: "https://harness.example.test",
  TRACE_CAPTCHA_TEST_HARNESS_SITE_KEY: "tc_site_test",
  TRACE_CAPTCHA_TEST_HARNESS_SECRET_KEY: "tc_server_test",
};

test("loads only an exact configured public origin and keeps the secret server-side", () => {
  const config = loadTestHarnessConfig(environment);

  assert.equal(config.action, "password_reset");
  assert.equal(config.publicOrigin, "https://harness.example.test");
  assert.equal(config.privateServerCredential, "tc_server_test");
});

test("rejects path-bearing origins and reversed credential classes", () => {
  assert.throws(
    () =>
      loadTestHarnessConfig({
        ...environment,
        TRACE_CAPTCHA_TEST_HARNESS_PUBLIC_ORIGIN:
          "https://harness.example.test/path",
      }),
    TestHarnessConfigurationError,
  );
  assert.throws(
    () =>
      loadTestHarnessConfig({
        ...environment,
        TRACE_CAPTCHA_TEST_HARNESS_SITE_KEY: "tc_server_not-public",
      }),
    TestHarnessConfigurationError,
  );
});
