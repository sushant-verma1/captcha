import assert from "node:assert/strict";
import test from "node:test";

import {
  issueSiteCredential,
  type SiteCredentialLookup,
  validateSiteCredential,
} from "./credentials.js";

test("validates a public site key only for its own credential class", async () => {
  const issued = await issueSiteCredential({
    siteId: "site-a",
    kind: "public_site_key",
  });
  const lookup = lookupFor(issued.record);

  const validated = await validateSiteCredential(
    issued.credential,
    "public_site_key",
    lookup,
  );

  assert.deepEqual(validated, {
    credentialId: issued.record.id,
    siteId: "site-a",
    kind: "public_site_key",
    keyId: issued.record.keyId,
  });
  assert.equal(
    await validateSiteCredential(
      issued.credential,
      "private_server_credential",
      lookup,
    ),
    null,
  );
});

test("rejects modified, revoked, and expired retiring credentials", async () => {
  const issued = await issueSiteCredential({
    siteId: "site-a",
    kind: "private_server_credential",
  });
  const lookup = lookupFor({
    ...issued.record,
    status: "retiring",
    notAfter: "2026-11-10T12:00:00.000Z",
  });

  assert.equal(
    await validateSiteCredential(
      `${issued.credential}x`,
      "private_server_credential",
      lookup,
    ),
    null,
  );
  assert.notEqual(
    await validateSiteCredential(
      issued.credential,
      "private_server_credential",
      lookup,
      new Date("2026-11-10T11:59:59.000Z"),
    ),
    null,
  );
  assert.equal(
    await validateSiteCredential(
      issued.credential,
      "private_server_credential",
      lookup,
      new Date("2026-11-10T12:00:00.000Z"),
    ),
    null,
  );
  assert.equal(
    await validateSiteCredential(
      issued.credential,
      "private_server_credential",
      lookupFor({ ...issued.record, status: "revoked" }),
    ),
    null,
  );
});

function lookupFor(
  record: Parameters<typeof createLookup>[0],
): SiteCredentialLookup {
  return createLookup(record);
}

function createLookup(record: {
  id: string;
  siteId: string;
  kind: "public_site_key" | "private_server_credential";
  keyId: string;
  secretHash: string;
  status: "active" | "retiring" | "revoked";
  notAfter?: string;
}): SiteCredentialLookup {
  return {
    async findByKeyId(keyId) {
      return keyId === record.keyId ? record : null;
    },
  };
}
