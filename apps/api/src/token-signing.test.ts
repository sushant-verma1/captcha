import assert from "node:assert/strict";
import test from "node:test";

import { decodeProtectedHeader, generateKeyPair, jwtVerify } from "jose";

import {
  ChallengeIneligibleForTokenError,
  TokenSigningUnavailableError,
  verificationTokenLifetimeSeconds,
  verificationTokenType,
  VerificationTokenSigner,
} from "./token-signing.js";

const now = new Date("2026-11-11T12:00:00.000Z");

test("issues a short-lived EdDSA token with only the required claims", async () => {
  const keyPair = await generateKeyPair("EdDSA");
  const signer = new VerificationTokenSigner({
    issuer: "https://tracecaptcha.example",
    keyProvider: {
      async getActiveSigningKey() {
        return {
          keyId: "key_2026_11",
          sign: async (signingInput) =>
            new Uint8Array(
              await crypto.subtle.sign(
                "Ed25519",
                keyPair.privateKey,
                Uint8Array.from(signingInput),
              ),
            ),
        };
      },
    },
    now: () => now,
    tokenId: () => "token_123",
  });

  const issued = await signer.issueAcceptedChallengeToken({
    customerId: "customer_123",
    siteId: "site_123",
    action: "signup",
    challengeId: "ch_123",
    audience: "site_123",
    challengeExpiresAt: "2026-11-11T12:01:00.000Z",
  });
  const protectedHeader = decodeProtectedHeader(issued.token);
  const verified = await jwtVerify(issued.token, keyPair.publicKey, {
    algorithms: ["EdDSA"],
    issuer: "https://tracecaptcha.example",
    audience: "site_123",
    typ: verificationTokenType,
    currentDate: now,
    requiredClaims: [
      "exp",
      "iat",
      "jti",
      "customerId",
      "siteId",
      "action",
      "challengeId",
    ],
  });

  assert.deepEqual(protectedHeader, {
    alg: "EdDSA",
    typ: verificationTokenType,
    kid: "key_2026_11",
  });
  assert.equal(issued.tokenId, "token_123");
  assert.equal(issued.expiresAt, "2026-11-11T12:05:00.000Z");
  assert.deepEqual(verified.payload, {
    iss: "https://tracecaptcha.example",
    aud: "site_123",
    iat: now.getTime() / 1_000,
    exp: now.getTime() / 1_000 + verificationTokenLifetimeSeconds,
    jti: "token_123",
    customerId: "customer_123",
    siteId: "site_123",
    action: "signup",
    challengeId: "ch_123",
  });
});

test("does not sign an expired challenge or use an unavailable key", async () => {
  let keyProviderCalls = 0;
  const expiredSigner = new VerificationTokenSigner({
    issuer: "https://tracecaptcha.example",
    keyProvider: {
      async getActiveSigningKey() {
        keyProviderCalls += 1;
        return null;
      },
    },
    now: () => now,
  });
  const input = {
    customerId: "customer_123",
    siteId: "site_123",
    action: "signup",
    challengeId: "ch_123",
    audience: "site_123",
    challengeExpiresAt: "2026-11-11T12:00:00.000Z",
  };

  await assert.rejects(
    expiredSigner.issueAcceptedChallengeToken(input),
    ChallengeIneligibleForTokenError,
  );
  assert.equal(keyProviderCalls, 0);

  await assert.rejects(
    expiredSigner.issueAcceptedChallengeToken({
      ...input,
      challengeExpiresAt: "2026-11-11T12:01:00.000Z",
    }),
    TokenSigningUnavailableError,
  );
});
