import {
  decodeProtectedHeader,
  jwtVerify,
  type KeyInput,
  type JWTPayload,
} from "jose";

import {
  verificationTokenType,
  verificationTokenLifetimeSeconds,
} from "./token-signing.js";

export type VerificationTokenPublicKeyProvider = {
  getVerificationKey(keyId: string): Promise<KeyInput | null>;
};

export type VerificationTokenConsumptionStore = {
  consume(tokenId: string, expiresAt: Date): Promise<boolean>;
};

export type RedisTokenConsumptionClient = {
  set(
    key: string,
    value: string,
    options: { NX: true; PX: number },
  ): Promise<string | null>;
};

export type TokenVerificationInput = {
  token: string;
  issuer: string;
  audience: string;
  customerId: string;
  siteId: string;
  expectedAction: string;
  consume: boolean;
};

export type TokenVerificationResult =
  { valid: true; action: string; expiresAt: string } | { valid: false };

export class TokenVerificationUnavailableError extends Error {
  public constructor() {
    super("Verification token validation is unavailable.");
    this.name = "TokenVerificationUnavailableError";
  }
}

export class RedisVerificationTokenConsumptionStore implements VerificationTokenConsumptionStore {
  public constructor(
    private readonly client: RedisTokenConsumptionClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async consume(tokenId: string, expiresAt: Date): Promise<boolean> {
    const ttlMilliseconds = expiresAt.getTime() - this.now().getTime();

    if (!Number.isFinite(ttlMilliseconds) || ttlMilliseconds <= 0) {
      return false;
    }

    return (
      (await this.client.set(tokenConsumptionKey(tokenId), "1", {
        NX: true,
        PX: ttlMilliseconds,
      })) === "OK"
    );
  }
}

export class VerificationTokenVerifier {
  public constructor(
    private readonly options: {
      keyProvider: VerificationTokenPublicKeyProvider;
      consumptionStore: VerificationTokenConsumptionStore;
      now?: () => Date;
    },
  ) {}

  public async verify(
    input: TokenVerificationInput,
  ): Promise<TokenVerificationResult> {
    const header = protectedHeader(input.token);

    if (header === null) {
      return { valid: false };
    }

    let verificationKey: KeyInput | null;

    try {
      verificationKey = await this.options.keyProvider.getVerificationKey(
        header.kid,
      );
    } catch {
      throw new TokenVerificationUnavailableError();
    }

    if (verificationKey === null) {
      return { valid: false };
    }

    let payload: JWTPayload;

    try {
      const verified = await jwtVerify(input.token, verificationKey, {
        algorithms: ["EdDSA"],
        typ: verificationTokenType,
        issuer: input.issuer,
        audience: input.audience,
        currentDate: (this.options.now ?? (() => new Date()))(),
        maxTokenAge: verificationTokenLifetimeSeconds,
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
      payload = verified.payload;
    } catch {
      return { valid: false };
    }

    const claims = scopedClaims(payload);

    if (
      claims === null ||
      claims.customerId !== input.customerId ||
      claims.siteId !== input.siteId ||
      claims.action !== input.expectedAction
    ) {
      return { valid: false };
    }

    const expiresAt = new Date(claims.exp * 1_000);

    if (input.consume) {
      let wasConsumed: boolean;

      try {
        wasConsumed = await this.options.consumptionStore.consume(
          claims.jti,
          expiresAt,
        );
      } catch {
        throw new TokenVerificationUnavailableError();
      }

      if (!wasConsumed) {
        return { valid: false };
      }
    }

    return {
      valid: true,
      action: claims.action,
      expiresAt: expiresAt.toISOString(),
    };
  }
}

function protectedHeader(token: string): { kid: string } | null {
  try {
    const header = decodeProtectedHeader(token);
    const keys = Object.keys(header);

    if (
      keys.length !== 3 ||
      !keys.every((key) => key === "alg" || key === "typ" || key === "kid") ||
      header.alg !== "EdDSA" ||
      header.typ !== verificationTokenType ||
      typeof header.kid !== "string" ||
      header.kid.length === 0
    ) {
      return null;
    }

    return { kid: header.kid };
  } catch {
    return null;
  }
}

function scopedClaims(payload: JWTPayload): {
  customerId: string;
  siteId: string;
  action: string;
  jti: string;
  exp: number;
} | null {
  const expiration = payload.exp;

  if (
    typeof payload.customerId !== "string" ||
    typeof payload.siteId !== "string" ||
    typeof payload.action !== "string" ||
    typeof payload.challengeId !== "string" ||
    typeof payload.jti !== "string" ||
    typeof expiration !== "number" ||
    !Number.isSafeInteger(expiration)
  ) {
    return null;
  }

  return {
    customerId: payload.customerId,
    siteId: payload.siteId,
    action: payload.action,
    jti: payload.jti,
    exp: expiration,
  };
}

function tokenConsumptionKey(tokenId: string): string {
  return `tracecaptcha:verification-token:${tokenId}`;
}
