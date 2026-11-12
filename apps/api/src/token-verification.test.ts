import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { generateKeyPair, SignJWT } from "jose";

import { VerificationTokenSigner } from "./token-signing.js";
import {
  type VerificationTokenConsumptionStore,
  TokenVerificationUnavailableError,
  VerificationTokenVerifier,
} from "./token-verification.js";

const issuedAt = new Date("2026-11-11T12:00:00.000Z");

test("verifies scoped EdDSA tokens and atomically rejects a replay", async () => {
  const fixture = await createFixture();
  const issued = await fixture.signer.issueAcceptedChallengeToken(tokenInput);
  const input = verificationInput(issued.token);

  assert.deepEqual(await fixture.verifier.verify(input), {
    valid: true,
    action: "signup",
    expiresAt: "2026-11-11T12:05:00.000Z",
  });
  assert.deepEqual(await fixture.verifier.verify(input), { valid: false });
});

test("does not consume a token when scope validation fails", async () => {
  const fixture = await createFixture();
  const issued = await fixture.signer.issueAcceptedChallengeToken(tokenInput);

  assert.deepEqual(
    await fixture.verifier.verify({
      ...verificationInput(issued.token),
      expectedAction: "login",
    }),
    { valid: false },
  );
  assert.equal(
    (await fixture.verifier.verify(verificationInput(issued.token))).valid,
    true,
  );
});

test("rejects invalid signatures and expired tokens without exposing details", async () => {
  const fixture = await createFixture();
  const issued = await fixture.signer.issueAcceptedChallengeToken(tokenInput);
  const tampered = `${issued.token}x`;

  assert.deepEqual(await fixture.verifier.verify(verificationInput(tampered)), {
    valid: false,
  });

  const expiredVerifier = new VerificationTokenVerifier({
    keyProvider: fixture.keyProvider,
    consumptionStore: new InMemoryConsumptionStore(),
    now: () => new Date("2026-11-11T12:06:00.000Z"),
  });

  assert.deepEqual(
    await expiredVerifier.verify(verificationInput(issued.token)),
    { valid: false },
  );
});

test("rejects malformed headers and signed claims without consuming them", async () => {
  const fixture = await createFixture();
  const tokens = [
    "not.a.jwt",
    await fixture.sign({
      ...validClaims(),
      siteId: "site_other",
    }),
    await fixture.sign({
      ...validClaims(),
      iss: "https://other.example",
    }),
    await fixture.sign({
      ...validClaims(),
      aud: "site_other",
    }),
    await fixture.sign({
      ...validClaims(),
      customerId: "customer_other",
    }),
    await fixture.sign({
      ...validClaims(),
      challengeId: undefined,
    }),
    await fixture.sign(validClaims(), {
      alg: "EdDSA",
      typ: "wrong-type",
      kid: "key_2026_11",
    }),
    await fixture.sign(validClaims(), {
      alg: "EdDSA",
      typ: "tracecaptcha-verification+jwt",
      kid: "unknown-key",
    }),
    replaceHeader(await fixture.sign(validClaims()), {
      alg: "HS256",
      typ: "tracecaptcha-verification+jwt",
      kid: "key_2026_11",
    }),
  ];

  for (const token of tokens) {
    assert.deepEqual(await fixture.verifier.verify(verificationInput(token)), {
      valid: false,
    });
  }

  assert.equal(fixture.consumptionStore.consumeCalls, 0);
});

test("reports unavailable key and consumption dependencies distinctly", async () => {
  const fixture = await createFixture();
  const issued = await fixture.signer.issueAcceptedChallengeToken(tokenInput);
  const unavailableKeyVerifier = new VerificationTokenVerifier({
    keyProvider: {
      async getVerificationKey() {
        throw new Error("key provider unavailable");
      },
    },
    consumptionStore: fixture.consumptionStore,
    now: () => issuedAt,
  });
  const unavailableConsumptionVerifier = new VerificationTokenVerifier({
    keyProvider: fixture.keyProvider,
    consumptionStore: {
      async consume() {
        throw new Error("redis unavailable");
      },
    },
    now: () => issuedAt,
  });

  await assert.rejects(
    unavailableKeyVerifier.verify(verificationInput(issued.token)),
    TokenVerificationUnavailableError,
  );
  await assert.rejects(
    unavailableConsumptionVerifier.verify(verificationInput(issued.token)),
    TokenVerificationUnavailableError,
  );
});

const tokenInput = {
  customerId: "customer_123",
  siteId: "site_123",
  action: "signup",
  challengeId: "ch_123",
  audience: "site_123",
  challengeExpiresAt: "2026-11-11T12:01:00.000Z",
};

function verificationInput(token: string) {
  return {
    token,
    issuer: "https://tracecaptcha.example",
    audience: "site_123",
    customerId: "customer_123",
    siteId: "site_123",
    expectedAction: "signup",
    consume: true,
  };
}

async function createFixture(): Promise<{
  signer: VerificationTokenSigner;
  verifier: VerificationTokenVerifier;
  consumptionStore: InMemoryConsumptionStore;
  keyProvider: {
    getVerificationKey(keyId: string): Promise<CryptoKey | null>;
  };
  sign(
    claims: Record<string, unknown>,
    header?: { alg: "EdDSA"; typ: string; kid: string },
  ): Promise<string>;
}> {
  const keyPair = await generateKeyPair("EdDSA");
  const keyProvider = {
    async getVerificationKey(keyId: string): Promise<CryptoKey | null> {
      return keyId === "key_2026_11" ? keyPair.publicKey : null;
    },
  };
  const consumptionStore = new InMemoryConsumptionStore();

  return {
    signer: new VerificationTokenSigner({
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
      now: () => issuedAt,
      tokenId: () => "token_123",
    }),
    verifier: new VerificationTokenVerifier({
      keyProvider,
      consumptionStore,
      now: () => issuedAt,
    }),
    consumptionStore,
    keyProvider,
    sign: async (
      claims,
      header = {
        alg: "EdDSA",
        typ: "tracecaptcha-verification+jwt",
        kid: "key_2026_11",
      },
    ) =>
      new SignJWT(claims).setProtectedHeader(header).sign(keyPair.privateKey),
  };
}

function validClaims(): Record<string, unknown> {
  return {
    iss: "https://tracecaptcha.example",
    aud: "site_123",
    iat: issuedAt.getTime() / 1_000,
    exp: issuedAt.getTime() / 1_000 + 300,
    jti: "adversarial-token",
    customerId: "customer_123",
    siteId: "site_123",
    action: "signup",
    challengeId: "ch_123",
  };
}

function replaceHeader(token: string, header: Record<string, string>): string {
  const [, encodedPayload, encodedSignature] = token.split(".");

  return `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${encodedPayload!}.${encodedSignature!}`;
}

class InMemoryConsumptionStore implements VerificationTokenConsumptionStore {
  private readonly consumed = new Set<string>();
  public consumeCalls = 0;

  public async consume(tokenId: string, expiresAt: Date): Promise<boolean> {
    this.consumeCalls += 1;
    if (
      expiresAt.getTime() <= issuedAt.getTime() ||
      this.consumed.has(tokenId)
    ) {
      return false;
    }

    this.consumed.add(tokenId);
    return true;
  }
}
