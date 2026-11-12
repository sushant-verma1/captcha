import type { StoredSiteCredential } from "./credentials.js";
import { validateSiteCredentialRecord } from "./credentials.js";

export type BrowserSiteCredentialRecord = StoredSiteCredential & {
  customerId: string;
  environmentId: string;
  webHostnames: readonly string[];
};

export type BrowserSiteCredentialLookup = {
  findByKeyId(keyId: string): Promise<BrowserSiteCredentialRecord | null>;
};

export type ServerSiteCredentialRecord = StoredSiteCredential & {
  customerId: string;
  environmentId: string;
};

export type ServerSiteCredentialLookup = {
  findByKeyId(keyId: string): Promise<ServerSiteCredentialRecord | null>;
};

export type AuthenticatedBrowserSite = {
  customerId: string;
  siteId: string;
  environmentId: string;
  credentialId: string;
};

export type AuthenticatedServerSite = {
  customerId: string;
  siteId: string;
  environmentId: string;
  credentialId: string;
};

export async function authenticateBrowserSite(
  siteKey: unknown,
  origin: unknown,
  lookup: BrowserSiteCredentialLookup,
  now: Date = new Date(),
): Promise<AuthenticatedBrowserSite | null> {
  const hostname = browserOriginHostname(origin);

  if (hostname === null) {
    return null;
  }

  const credential = await validateSiteCredentialRecord(
    siteKey,
    "public_site_key",
    lookup,
    now,
  );

  if (
    credential === null ||
    !credential.webHostnames.some((allowed) => allowed === hostname)
  ) {
    return null;
  }

  return {
    customerId: credential.customerId,
    siteId: credential.siteId,
    environmentId: credential.environmentId,
    credentialId: credential.id,
  };
}

export async function authenticateServerSite(
  secretKey: unknown,
  lookup: ServerSiteCredentialLookup,
  now: Date = new Date(),
): Promise<AuthenticatedServerSite | null> {
  const credential = await validateSiteCredentialRecord(
    secretKey,
    "private_server_credential",
    lookup,
    now,
  );

  if (credential === null) {
    return null;
  }

  return {
    customerId: credential.customerId,
    siteId: credential.siteId,
    environmentId: credential.environmentId,
    credentialId: credential.id,
  };
}

function browserOriginHostname(origin: unknown): string | null {
  if (typeof origin !== "string" || origin.length > 2_048) {
    return null;
  }

  try {
    const parsed = new URL(origin);

    if (
      parsed.origin !== origin ||
      (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    ) {
      return null;
    }

    return parsed.hostname;
  } catch {
    return null;
  }
}
