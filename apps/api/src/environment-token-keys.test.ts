import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";

import {
  createEnvironmentTokenKeyProviders,
  EnvironmentTokenKeyConfigurationError,
  loadEnvironmentTokenKeyConfig,
} from "./environment-token-keys.js";
import { VerificationTokenSigner } from "./token-signing.js";
import {
  type VerificationTokenConsumptionStore,
  VerificationTokenVerifier,
} from "./token-verification.js";

test("uses an escaped environment PEM without returning private key material", async () => {
  const keyPair = await generateKeyPair("EdDSA", { extractable: true });
  const providers = await createEnvironmentTokenKeyProviders(
    loadEnvironmentTokenKeyConfig({
      TRACE_CAPTCHA_TOKEN_ACTIVE_KEY_ID: "env_key_1",
      TRACE_CAPTCHA_TOKEN_SIGNING_KEY_PEM: (
        await exportPKCS8(keyPair.privateKey)
      ).replaceAll("\n", "\\n"),
    }),
  );
  const signer = new VerificationTokenSigner({
    issuer: "https://tracecaptcha.example",
    keyProvider: providers.signingKeyProvider,
    now: () => new Date("2026-11-11T12:00:00.000Z"),
    tokenId: () => "token_123",
  });
  const verifier = new VerificationTokenVerifier({
    keyProvider: providers.verificationKeyProvider,
    consumptionStore: new InMemoryConsumptionStore(),
    now: () => new Date("2026-11-11T12:00:00.000Z"),
  });

  const issued = await signer.issueAcceptedChallengeToken({
    customerId: "customer_123",
    siteId: "site_123",
    action: "signup",
    challengeId: "ch_123",
    audience: "site_123",
    challengeExpiresAt: "2026-11-11T12:01:00.000Z",
  });

  assert.deepEqual(
    await verifier.verify({
      token: issued.token,
      issuer: "https://tracecaptcha.example",
      audience: "site_123",
      customerId: "customer_123",
      siteId: "site_123",
      expectedAction: "signup",
      consume: true,
    }),
    {
      valid: true,
      action: "signup",
      expiresAt: "2026-11-11T12:05:00.000Z",
    },
  );
});

test("rejects incomplete or malformed environment key configuration", () => {
  assert.throws(
    () =>
      loadEnvironmentTokenKeyConfig({
        TRACE_CAPTCHA_TOKEN_ACTIVE_KEY_ID: "env_key_1",
      }),
    EnvironmentTokenKeyConfigurationError,
  );
  assert.throws(
    () =>
      loadEnvironmentTokenKeyConfig({
        TRACE_CAPTCHA_TOKEN_ACTIVE_KEY_ID: "env_key_1",
        TRACE_CAPTCHA_TOKEN_SIGNING_KEY_PEM: "not a private key",
        TRACE_CAPTCHA_TOKEN_RETIRING_PUBLIC_KEYS: "not JSON",
      }),
    EnvironmentTokenKeyConfigurationError,
  );
});

test("rejects private key material that cannot produce an Ed25519 provider", async () => {
  await assert.rejects(
    createEnvironmentTokenKeyProviders({
      activeKeyId: "env_key_1",
      privateKeyPem: "not a private key",
    }),
    EnvironmentTokenKeyConfigurationError,
  );
});

test("accepts a retiring public key but rejects an unknown key identifier", async () => {
  const activeKeyPair = await generateKeyPair("EdDSA", { extractable: true });
  const retiringKeyPair = await generateKeyPair("EdDSA", { extractable: true });
  const providers = await createEnvironmentTokenKeyProviders({
    activeKeyId: "active_key",
    privateKeyPem: await exportPKCS8(activeKeyPair.privateKey),
    retiringPublicKeyPems: {
      retiring_key: await exportSPKI(retiringKeyPair.publicKey),
    },
  });
  const signer = new VerificationTokenSigner({
    issuer: "https://tracecaptcha.example",
    keyProvider: {
      async getActiveSigningKey() {
        return {
          keyId: "retiring_key",
          sign: async (signingInput) =>
            new Uint8Array(
              await crypto.subtle.sign(
                "Ed25519",
                retiringKeyPair.privateKey,
                Uint8Array.from(signingInput),
              ),
            ),
        };
      },
    },
    now: () => new Date("2026-11-11T12:00:00.000Z"),
    tokenId: () => "retiring_token",
  });
  const verifier = new VerificationTokenVerifier({
    keyProvider: providers.verificationKeyProvider,
    consumptionStore: new InMemoryConsumptionStore(),
    now: () => new Date("2026-11-11T12:00:00.000Z"),
  });
  const issued = await signer.issueAcceptedChallengeToken({
    customerId: "customer_123",
    siteId: "site_123",
    action: "signup",
    challengeId: "ch_123",
    audience: "site_123",
    challengeExpiresAt: "2026-11-11T12:01:00.000Z",
  });
  const [encodedHeader, encodedPayload, encodedSignature] =
    issued.token.split(".");
  const unknownKeyHeader = Buffer.from(
    JSON.stringify({
      ...JSON.parse(Buffer.from(encodedHeader!, "base64url").toString("utf8")),
      kid: "unknown_key",
    }),
  ).toString("base64url");
  const unknownKeyToken = `${unknownKeyHeader}.${encodedPayload!}.${encodedSignature!}`;

  assert.equal(
    (
      await verifier.verify({
        token: issued.token,
        issuer: "https://tracecaptcha.example",
        audience: "site_123",
        customerId: "customer_123",
        siteId: "site_123",
        expectedAction: "signup",
        consume: false,
      })
    ).valid,
    true,
  );
  assert.deepEqual(
    await verifier.verify({
      token: unknownKeyToken,
      issuer: "https://tracecaptcha.example",
      audience: "site_123",
      customerId: "customer_123",
      siteId: "site_123",
      expectedAction: "signup",
      consume: false,
    }),
    { valid: false },
  );
});

class InMemoryConsumptionStore implements VerificationTokenConsumptionStore {
  public async consume(): Promise<boolean> {
    return true;
  }
}
