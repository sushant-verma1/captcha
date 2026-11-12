import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "./config.js";

const baseEnvironment = {
  TRACE_CAPTCHA_REDIS_URL: "redis://127.0.0.1:6379",
  TRACE_CAPTCHA_DATABASE_URL: "postgres://user:password@127.0.0.1:5432/db",
  TRACE_CAPTCHA_TOKEN_ISSUER: "https://tracecaptcha.example",
  TRACE_CAPTCHA_TOKEN_ACTIVE_KEY_ID: "env_key_1",
  TRACE_CAPTCHA_TOKEN_SIGNING_KEY_PEM: "provided-at-runtime",
};

test("loads the required private token signing configuration", () => {
  const config = loadConfig(baseEnvironment);

  assert.equal(config.tokenSigning.issuer, "https://tracecaptcha.example");
  assert.equal(config.tokenSigning.keyConfig.activeKeyId, "env_key_1");
  assert.equal(
    config.tokenSigning.keyConfig.privateKeyPem,
    "provided-at-runtime",
  );
});

test("rejects missing or malformed token signing configuration", () => {
  const missingPrivateKey = { ...baseEnvironment };
  delete (missingPrivateKey as Partial<typeof baseEnvironment>)
    .TRACE_CAPTCHA_TOKEN_SIGNING_KEY_PEM;

  assert.throws(() => loadConfig(missingPrivateKey));
  assert.throws(
    () =>
      loadConfig({
        ...baseEnvironment,
        TRACE_CAPTCHA_TOKEN_RETIRING_PUBLIC_KEYS: "not JSON",
      }),
    /Invalid TraceCAPTCHA token-signing configuration/,
  );
});
