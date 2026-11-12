import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

import type {
  SiteCredentialKind,
  SiteCredentialStatus,
} from "@tracecaptcha/shared-types";

const secretLength = 32;
const saltLength = 16;
const hashLength = 32;
const hashVersion = "scrypt-v1";
const scryptOptions: ScryptOptions = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};
const credentialPattern =
  /^(tc_site|tc_server)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_([A-Za-z0-9_-]{43})$/;

export type NewSiteCredential = {
  id: string;
  siteId: string;
  kind: SiteCredentialKind;
  keyId: string;
  secretHash: string;
  label?: string;
  status: "active";
};

export type IssuedSiteCredential = {
  credential: string;
  record: NewSiteCredential;
};

export type StoredSiteCredential = {
  id: string;
  siteId: string;
  kind: SiteCredentialKind;
  keyId: string;
  secretHash: string;
  status: SiteCredentialStatus;
  notAfter?: string;
};

export type SiteCredentialLookup = {
  findByKeyId(keyId: string): Promise<StoredSiteCredential | null>;
};

export type ValidatedSiteCredential = {
  credentialId: string;
  siteId: string;
  kind: SiteCredentialKind;
  keyId: string;
};

export async function issueSiteCredential(input: {
  siteId: string;
  kind: SiteCredentialKind;
  label?: string;
}): Promise<IssuedSiteCredential> {
  const keyId = randomUUID();
  const secret = randomBytes(secretLength).toString("base64url");
  const prefix = input.kind === "public_site_key" ? "tc_site" : "tc_server";

  return {
    credential: `${prefix}_${keyId}_${secret}`,
    record: {
      id: randomUUID(),
      siteId: input.siteId,
      kind: input.kind,
      keyId,
      secretHash: await hashCredentialSecret(secret),
      ...(input.label === undefined ? {} : { label: input.label }),
      status: "active",
    },
  };
}

export async function validateSiteCredential(
  rawCredential: unknown,
  expectedKind: SiteCredentialKind,
  lookup: SiteCredentialLookup,
  now: Date = new Date(),
): Promise<ValidatedSiteCredential | null> {
  const stored = await validateSiteCredentialRecord(
    rawCredential,
    expectedKind,
    lookup,
    now,
  );

  if (stored === null) {
    return null;
  }

  return {
    credentialId: stored.id,
    siteId: stored.siteId,
    kind: stored.kind,
    keyId: stored.keyId,
  };
}

export async function validateSiteCredentialRecord<
  T extends StoredSiteCredential,
>(
  rawCredential: unknown,
  expectedKind: SiteCredentialKind,
  lookup: { findByKeyId(keyId: string): Promise<T | null> },
  now: Date = new Date(),
): Promise<T | null> {
  const parsed = parseCredential(rawCredential);

  if (parsed === null || parsed.kind !== expectedKind) {
    return null;
  }

  const stored = await lookup.findByKeyId(parsed.keyId);

  if (
    stored === null ||
    stored.kind !== expectedKind ||
    stored.keyId !== parsed.keyId ||
    !isCredentialUsable(stored.status, stored.notAfter, now) ||
    !(await verifyCredentialSecret(parsed.secret, stored.secretHash))
  ) {
    return null;
  }

  return stored;
}

function parseCredential(
  rawCredential: unknown,
): { kind: SiteCredentialKind; keyId: string; secret: string } | null {
  if (typeof rawCredential !== "string") {
    return null;
  }

  const match = credentialPattern.exec(rawCredential);

  if (match === null) {
    return null;
  }

  return {
    kind:
      match[1] === "tc_site" ? "public_site_key" : "private_server_credential",
    keyId: match[2]!,
    secret: match[3]!,
  };
}

function isCredentialUsable(
  status: SiteCredentialStatus,
  notAfter: string | undefined,
  now: Date,
): boolean {
  if (status === "active") {
    return true;
  }

  if (status !== "retiring" || notAfter === undefined) {
    return false;
  }

  const notAfterTime = Date.parse(notAfter);
  return Number.isFinite(notAfterTime) && now.getTime() < notAfterTime;
}

async function hashCredentialSecret(secret: string): Promise<string> {
  const salt = randomBytes(saltLength);
  const hash = await deriveCredentialHash(secret, salt);

  return `${hashVersion}$${salt.toString("base64url")}$${Buffer.from(hash).toString("base64url")}`;
}

async function verifyCredentialSecret(
  secret: string,
  encodedHash: string,
): Promise<boolean> {
  const [version, encodedSalt, encodedExpectedHash, ...extra] =
    encodedHash.split("$");

  if (
    version !== hashVersion ||
    encodedSalt === undefined ||
    encodedExpectedHash === undefined ||
    extra.length !== 0
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const expectedHash = Buffer.from(encodedExpectedHash, "base64url");

    if (salt.length !== saltLength || expectedHash.length !== hashLength) {
      return false;
    }

    const actualHash = await deriveCredentialHash(secret, salt);
    return timingSafeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}

function deriveCredentialHash(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      secret,
      salt,
      hashLength,
      scryptOptions,
      (error, derivedKey) => {
        if (error !== null) {
          reject(error);
          return;
        }

        resolve(Buffer.from(derivedKey));
      },
    );
  });
}
