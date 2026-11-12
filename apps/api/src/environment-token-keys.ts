import { createPrivateKey, createPublicKey } from "node:crypto";

import { importPKCS8, importSPKI, type KeyInput } from "jose";

import type {
  ActiveVerificationSigningKey,
  ActiveVerificationSigningKeyProvider,
} from "./token-signing.js";
import type { VerificationTokenPublicKeyProvider } from "./token-verification.js";

export type EnvironmentTokenKeyConfig = {
  activeKeyId: string;
  privateKeyPem: string;
  retiringPublicKeyPems?: Readonly<Record<string, string>>;
};

export type EnvironmentTokenKeyProviders = {
  signingKeyProvider: ActiveVerificationSigningKeyProvider;
  verificationKeyProvider: VerificationTokenPublicKeyProvider;
};

export class EnvironmentTokenKeyConfigurationError extends Error {
  public constructor() {
    super("Verification-token key configuration is invalid.");
    this.name = "EnvironmentTokenKeyConfigurationError";
  }
}

export function loadEnvironmentTokenKeyConfig(
  environment: NodeJS.ProcessEnv = process.env,
): EnvironmentTokenKeyConfig {
  const activeKeyId = environment.TRACE_CAPTCHA_TOKEN_ACTIVE_KEY_ID;
  const privateKeyPem = environment.TRACE_CAPTCHA_TOKEN_SIGNING_KEY_PEM;

  if (activeKeyId === undefined || privateKeyPem === undefined) {
    throw new EnvironmentTokenKeyConfigurationError();
  }

  const retiringPublicKeyPems = parseRetiringPublicKeyPems(
    environment.TRACE_CAPTCHA_TOKEN_RETIRING_PUBLIC_KEYS,
  );

  return {
    activeKeyId,
    privateKeyPem,
    ...(retiringPublicKeyPems === undefined ? {} : { retiringPublicKeyPems }),
  };
}

/**
 * Imports an Ed25519 private key supplied by the deployment's secret manager.
 * The environment value is never logged or returned, and only public key
 * material is retained for verification-key rotation.
 */
export async function createEnvironmentTokenKeyProviders(
  config: EnvironmentTokenKeyConfig,
): Promise<EnvironmentTokenKeyProviders> {
  if (
    config.activeKeyId.length === 0 ||
    config.activeKeyId.length > 255 ||
    config.privateKeyPem.length === 0 ||
    config.retiringPublicKeyPems?.[config.activeKeyId] !== undefined
  ) {
    throw new EnvironmentTokenKeyConfigurationError();
  }

  const privateKeyPem = normalizePem(config.privateKeyPem);

  try {
    const privateKey = await importPKCS8(privateKeyPem, "EdDSA");
    const activePublicKeyPem = createPublicKey(
      createPrivateKey(privateKeyPem),
    ).export({ type: "spki", format: "pem" });

    if (typeof activePublicKeyPem !== "string") {
      throw new EnvironmentTokenKeyConfigurationError();
    }

    const publicKeys = new Map<string, KeyInput>();

    publicKeys.set(
      config.activeKeyId,
      await importSPKI(activePublicKeyPem, "EdDSA"),
    );

    for (const [keyId, publicKeyPem] of Object.entries(
      config.retiringPublicKeyPems ?? {},
    )) {
      if (
        keyId.length === 0 ||
        keyId.length > 255 ||
        publicKeyPem.length === 0
      ) {
        throw new EnvironmentTokenKeyConfigurationError();
      }

      publicKeys.set(
        keyId,
        await importSPKI(normalizePem(publicKeyPem), "EdDSA"),
      );
    }

    return {
      signingKeyProvider: {
        async getActiveSigningKey(): Promise<ActiveVerificationSigningKey> {
          return {
            keyId: config.activeKeyId,
            sign: async (signingInput) =>
              new Uint8Array(
                await crypto.subtle.sign(
                  "Ed25519",
                  privateKey,
                  Uint8Array.from(signingInput),
                ),
              ),
          };
        },
      },
      verificationKeyProvider: {
        async getVerificationKey(keyId: string): Promise<KeyInput | null> {
          return publicKeys.get(keyId) ?? null;
        },
      },
    };
  } catch (error) {
    if (error instanceof EnvironmentTokenKeyConfigurationError) {
      throw error;
    }

    throw new EnvironmentTokenKeyConfigurationError();
  }
}

function normalizePem(value: string): string {
  return value.replaceAll("\\n", "\n");
}

function parseRetiringPublicKeyPems(
  value: string | undefined,
): Readonly<Record<string, string>> | undefined {
  if (value === undefined || value.length === 0) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.values(parsed).some(
        (publicKeyPem) => typeof publicKeyPem !== "string",
      )
    ) {
      throw new EnvironmentTokenKeyConfigurationError();
    }

    return parsed as Record<string, string>;
  } catch (error) {
    if (error instanceof EnvironmentTokenKeyConfigurationError) {
      throw error;
    }

    throw new EnvironmentTokenKeyConfigurationError();
  }
}
