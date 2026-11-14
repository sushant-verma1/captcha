import assert from "node:assert/strict";
import test from "node:test";

import { consumeTestHarnessToken } from "./token-verification.js";

test("consumes a token with a server-configured action and secret", async () => {
  let request: { input: string; init: RequestInit } | undefined;

  const outcome = await consumeTestHarnessToken({
    apiOrigin: "https://captcha.example.test",
    privateServerCredential: "tc_server_test",
    expectedAction: "password_reset",
    token: "untrusted-browser-token",
    fetch: async (input, init) => {
      request = { input, init };
      return { status: 200, json: async () => ({ valid: true }) };
    },
  });

  assert.deepEqual(outcome, { kind: "verified" });
  assert.deepEqual(request, {
    input: "https://captcha.example.test/v1/tokens/verify",
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TraceCAPTCHA-Secret-Key": "tc_server_test",
      },
      body: JSON.stringify({
        token: "untrusted-browser-token",
        expectedAction: "password_reset",
        consume: true,
      }),
    },
  });
});

test("fails closed for malformed tokens and unavailable dependencies", async () => {
  assert.deepEqual(
    await consumeTestHarnessToken({
      apiOrigin: "https://captcha.example.test",
      privateServerCredential: "tc_server_test",
      expectedAction: "signup",
      token: "",
    }),
    { kind: "invalid" },
  );

  assert.deepEqual(
    await consumeTestHarnessToken({
      apiOrigin: "https://captcha.example.test",
      privateServerCredential: "tc_server_test",
      expectedAction: "signup",
      token: "token",
      fetch: async () => {
        throw new Error("unavailable");
      },
    }),
    { kind: "unavailable" },
  );
});
