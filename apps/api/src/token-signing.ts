import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

export const verificationTokenType = "tracecaptcha-verification+jwt";
export const verificationTokenLifetimeSeconds = 300;

export type ActiveVerificationSigningKey = {
  keyId: string;
  sign(signingInput: Uint8Array): Promise<Uint8Array>;
};

/**
 * Production adapters must sign through managed key storage. Neither this
 * interface nor token records persist private key material.
 */
export type ActiveVerificationSigningKeyProvider = {
  getActiveSigningKey(): Promise<ActiveVerificationSigningKey | null>;
};

export type AcceptedChallengeTokenInput = {
  customerId: string;
  siteId: string;
  action: string;
  challengeId: string;
  audience: string;
  challengeExpiresAt: string;
};

export type IssuedVerificationToken = {
  token: string;
  tokenId: string;
  expiresAt: string;
};

export class TokenSigningUnavailableError extends Error {
  public constructor() {
    super("Verification token signing is unavailable.");
    this.name = "TokenSigningUnavailableError";
  }
}

export class ChallengeIneligibleForTokenError extends Error {
  public constructor() {
    super("The challenge is not eligible for a verification token.");
    this.name = "ChallengeIneligibleForTokenError";
  }
}

export class VerificationTokenSigner {
  public constructor(
    private readonly options: {
      issuer: string;
      keyProvider: ActiveVerificationSigningKeyProvider;
      now?: () => Date;
      tokenId?: () => string;
    },
  ) {}

  /**
   * This operation is intentionally named for the accepted-only path. Route
   * integration must call it only after authenticated binding, atomic challenge
   * consumption, and a passing internal assessment.
   */
  public async issueAcceptedChallengeToken(
    input: AcceptedChallengeTokenInput,
  ): Promise<IssuedVerificationToken> {
    const now = (this.options.now ?? (() => new Date()))();
    const challengeExpiry = Date.parse(input.challengeExpiresAt);

    if (!Number.isFinite(challengeExpiry) || challengeExpiry <= now.getTime()) {
      throw new ChallengeIneligibleForTokenError();
    }

    assertClaimInput(input);

    const signingKey = await this.options.keyProvider.getActiveSigningKey();

    if (
      signingKey === null ||
      signingKey.keyId.length === 0 ||
      typeof signingKey.sign !== "function"
    ) {
      throw new TokenSigningUnavailableError();
    }

    const issuedAtSeconds = Math.floor(now.getTime() / 1_000);
    const expiresAtSeconds = issuedAtSeconds + verificationTokenLifetimeSeconds;
    const tokenId = (this.options.tokenId ?? randomUUID)();

    if (tokenId.length === 0) {
      throw new TokenSigningUnavailableError();
    }

    const protectedHeader = encodeJson({
      alg: "EdDSA",
      typ: verificationTokenType,
      kid: signingKey.keyId,
    });
    const payload = encodeJson({
      iss: this.options.issuer,
      aud: input.audience,
      iat: issuedAtSeconds,
      exp: expiresAtSeconds,
      jti: tokenId,
      customerId: input.customerId,
      siteId: input.siteId,
      action: input.action,
      challengeId: input.challengeId,
    });
    const signingInput = `${protectedHeader}.${payload}`;

    try {
      const signature = await signingKey.sign(
        new TextEncoder().encode(signingInput),
      );
      const token = `${signingInput}.${encodeBytes(signature)}`;

      return {
        token,
        tokenId,
        expiresAt: new Date(expiresAtSeconds * 1_000).toISOString(),
      };
    } catch {
      throw new TokenSigningUnavailableError();
    }
  }
}

function encodeJson(value: Record<string, string | number>): string {
  return encodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function encodeBytes(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function assertClaimInput(input: AcceptedChallengeTokenInput): void {
  const values = [
    input.customerId,
    input.siteId,
    input.action,
    input.challengeId,
    input.audience,
  ];

  if (
    input.challengeExpiresAt.length === 0 ||
    input.audience !== input.siteId ||
    values.some((value) => value.length === 0 || value.length > 255)
  ) {
    throw new ChallengeIneligibleForTokenError();
  }
}
