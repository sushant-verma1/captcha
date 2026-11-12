import assert from "node:assert/strict";
import test from "node:test";

import { generateKeyPair } from "jose";

import type { AppConfig } from "./config.js";
import { issueSiteCredential } from "./credentials.js";
import { buildServer } from "./server.js";
import { ServerTokenVerificationService } from "./server-token-verification.js";
import type { ServerSiteCredentialRecord } from "./site-authentication.js";
import { VerificationTokenSigner } from "./token-signing.js";
import {
  type VerificationTokenConsumptionStore,
  VerificationTokenVerifier,
} from "./token-verification.js";

const issuer = "https://tracecaptcha.example";
const testConfig: AppConfig = {
  environment: "test",
  host: "127.0.0.1",
  port: 3_000,
  logLevel: "fatal",
  redisUrl: "redis://127.0.0.1:6379",
  databaseUrl: "postgresql://tracecaptcha@127.0.0.1:5432/tracecaptcha",
  tokenSigning: {
    issuer,
    keyConfig: {
      activeKeyId: "test_key_1",
      privateKeyPem: "test-only-not-loaded-by-this-server-fixture",
    },
  },
};

test("privately verifies and atomically consumes a site-bound token", async () => {
  const fixture = await createFixture();
  const issued = await fixture.signer.issueAcceptedChallengeToken({
    customerId: "customer_123",
    siteId: "site_123",
    action: "signup",
    challengeId: "challenge_123",
    audience: "site_123",
    challengeExpiresAt: "2026-11-11T12:01:00.000Z",
  });

  assert.deepEqual(
    await fixture.service.verify({
      secretKey: fixture.secretKey,
      token: issued.token,
      expectedAction: "signup",
      consume: true,
    }),
    {
      outcome: "verified",
      response: {
        valid: true,
        action: "signup",
        expiresAt: "2026-11-11T12:05:00.000Z",
      },
    },
  );
  assert.deepEqual(
    await fixture.service.verify({
      secretKey: fixture.secretKey,
      token: issued.token,
      expectedAction: "signup",
      consume: true,
    }),
    { outcome: "verified", response: { valid: false } },
  );
  assert.deepEqual(
    await fixture.service.verify({
      secretKey: "not-a-server-credential",
      token: issued.token,
      expectedAction: "signup",
      consume: false,
    }),
    { outcome: "invalid_secret_key" },
  );
});

test("exposes only generic private endpoint outcomes", async () => {
  const fixture = await createFixture();
  const issued = await fixture.signer.issueAcceptedChallengeToken({
    customerId: "customer_123",
    siteId: "site_123",
    action: "signup",
    challengeId: "challenge_123",
    audience: "site_123",
    challengeExpiresAt: "2026-11-11T12:01:00.000Z",
  });
  const server = buildServer(testConfig, { tokenVerifier: fixture.service });

  try {
    const wrongAction = await server.inject({
      method: "POST",
      url: "/v1/tokens/verify",
      headers: { "x-tracecaptcha-secret-key": fixture.secretKey },
      payload: { token: issued.token, expectedAction: "login" },
    });

    assert.equal(wrongAction.statusCode, 200);
    assert.deepEqual(wrongAction.json(), { valid: false });

    const accepted = await server.inject({
      method: "POST",
      url: "/v1/tokens/verify",
      headers: { "x-tracecaptcha-secret-key": fixture.secretKey },
      payload: { token: issued.token, expectedAction: "signup" },
    });

    assert.equal(accepted.statusCode, 200);
    assert.deepEqual(accepted.json(), {
      valid: true,
      action: "signup",
      expiresAt: "2026-11-11T12:05:00.000Z",
    });

    const replay = await server.inject({
      method: "POST",
      url: "/v1/tokens/verify",
      headers: { "x-tracecaptcha-secret-key": fixture.secretKey },
      payload: { token: issued.token, expectedAction: "signup" },
    });

    assert.equal(replay.statusCode, 200);
    assert.deepEqual(replay.json(), { valid: false });

    const invalidSecret = await server.inject({
      method: "POST",
      url: "/v1/tokens/verify",
      headers: { "x-tracecaptcha-secret-key": "not-a-server-credential" },
      payload: { token: issued.token, expectedAction: "signup" },
    });

    assert.equal(invalidSecret.statusCode, 401);
    assert.deepEqual(invalidSecret.json(), {
      error: {
        code: "invalid_secret_key",
        message: "The secret key is missing or invalid.",
      },
    });
  } finally {
    await server.close();
  }
});

test("treats credential-store failure as unavailable", async () => {
  const fixture = await createFixture();
  const unavailable = new ServerTokenVerificationService(
    {
      async findByKeyId(): Promise<ServerSiteCredentialRecord | null> {
        throw new Error("database unavailable");
      },
    },
    fixture.verifier,
    issuer,
  );

  const server = buildServer(testConfig, { tokenVerifier: unavailable });

  try {
    const response = await server.inject({
      method: "POST",
      url: "/v1/tokens/verify",
      headers: { "x-tracecaptcha-secret-key": fixture.secretKey },
      payload: { token: "not-a-token", expectedAction: "signup" },
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), {
      error: {
        code: "service_unavailable",
        message: "Verification is temporarily unavailable. Please try again.",
      },
    });
  } finally {
    await server.close();
  }
});

async function createFixture(): Promise<{
  secretKey: string;
  signer: VerificationTokenSigner;
  verifier: VerificationTokenVerifier;
  service: ServerTokenVerificationService;
}> {
  const now = new Date("2026-11-11T12:00:00.000Z");
  const keyPair = await generateKeyPair("EdDSA");
  const issuedCredential = await issueSiteCredential({
    siteId: "site_123",
    kind: "private_server_credential",
  });
  const credential: ServerSiteCredentialRecord = {
    ...issuedCredential.record,
    customerId: "customer_123",
    environmentId: "environment_123",
  };
  const keyProvider = {
    async getVerificationKey(keyId: string): Promise<CryptoKey | null> {
      return keyId === "key_2026_11" ? keyPair.publicKey : null;
    },
  };
  const verifier = new VerificationTokenVerifier({
    keyProvider,
    consumptionStore: new InMemoryConsumptionStore(),
    now: () => now,
  });
  const signer = new VerificationTokenSigner({
    issuer,
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
  const lookup = {
    async findByKeyId(
      keyId: string,
    ): Promise<ServerSiteCredentialRecord | null> {
      return keyId === credential.keyId ? credential : null;
    },
  };

  return {
    secretKey: issuedCredential.credential,
    signer,
    verifier,
    service: new ServerTokenVerificationService(lookup, verifier, issuer),
  };
}

class InMemoryConsumptionStore implements VerificationTokenConsumptionStore {
  private readonly consumedTokenIds = new Set<string>();

  public async consume(tokenId: string): Promise<boolean> {
    if (this.consumedTokenIds.has(tokenId)) {
      return false;
    }

    this.consumedTokenIds.add(tokenId);
    return true;
  }
}
