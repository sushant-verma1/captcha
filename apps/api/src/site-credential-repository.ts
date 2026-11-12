import type { Pool } from "pg";

import type {
  BrowserSiteCredentialLookup,
  BrowserSiteCredentialRecord,
  ServerSiteCredentialLookup,
} from "./site-authentication.js";

type SiteCredentialRow = {
  id: string;
  siteId: string;
  customerId: string;
  environmentId: string;
  kind: "public_site_key" | "private_server_credential";
  keyId: string;
  secretHash: string;
  status: "active" | "retiring" | "revoked";
  notAfter: Date | null;
  webHostnames: string[];
};

export class PostgresBrowserSiteCredentialLookup
  implements BrowserSiteCredentialLookup, ServerSiteCredentialLookup
{
  public constructor(private readonly database: Pick<Pool, "query">) {}

  public async findByKeyId(
    keyId: string,
  ): Promise<BrowserSiteCredentialRecord | null> {
    const result = await this.database.query<SiteCredentialRow>(
      `SELECT
        credential.id,
        credential.site_id AS "siteId",
        site.customer_id AS "customerId",
        site.environment_id AS "environmentId",
        credential.credential_kind AS kind,
        credential.key_id AS "keyId",
        credential.secret_hash AS "secretHash",
        credential.status,
        credential.not_after AS "notAfter",
        COALESCE(
          array_agg(identifier.value) FILTER (
            WHERE identifier.kind = 'web_hostname'
          ),
          '{}'
        ) AS "webHostnames"
      FROM tracecaptcha_site_credentials credential
      INNER JOIN tracecaptcha_sites site ON site.id = credential.site_id
      INNER JOIN tracecaptcha_customers customer ON customer.id = site.customer_id
      INNER JOIN tracecaptcha_environments environment
        ON environment.id = site.environment_id
        AND environment.customer_id = site.customer_id
      LEFT JOIN tracecaptcha_site_identifiers identifier ON identifier.site_id = site.id
      WHERE credential.key_id = $1
        AND customer.status = 'active'
        AND environment.status = 'active'
        AND site.status = 'active'
      GROUP BY credential.id, site.id`,
      [keyId],
    );
    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    return {
      id: row.id,
      siteId: row.siteId,
      customerId: row.customerId,
      environmentId: row.environmentId,
      kind: row.kind,
      keyId: row.keyId,
      secretHash: row.secretHash,
      status: row.status,
      ...(row.notAfter === null
        ? {}
        : { notAfter: row.notAfter.toISOString() }),
      webHostnames: row.webHostnames,
    };
  }
}
