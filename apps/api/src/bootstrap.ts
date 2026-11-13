import { randomUUID } from "node:crypto";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

import { initialProtectedActions } from "@tracecaptcha/shared-types";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";

import { issueSiteCredential } from "./credentials.js";
import { initialActionPolicyDefaults } from "./policies.js";

const bootstrapLockId = 684_296_208;

const bootstrapEnvironmentSchema = z.object({
  TRACE_CAPTCHA_DATABASE_URL: z.string().url(),
  TRACE_CAPTCHA_BOOTSTRAP_CONFIRM: z.literal("provision"),
  TRACE_CAPTCHA_BOOTSTRAP_CUSTOMER_NAME: z.string().min(1).max(255),
  TRACE_CAPTCHA_BOOTSTRAP_ENVIRONMENT: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_-]{0,62}$/),
  TRACE_CAPTCHA_BOOTSTRAP_SITE_NAME: z.string().min(1).max(255),
  TRACE_CAPTCHA_BOOTSTRAP_WEB_HOSTNAME: z.string().min(1).max(255),
  TRACE_CAPTCHA_BOOTSTRAP_OUTPUT_PATH: z.string().min(1),
});

export type BootstrapInput = {
  customerName: string;
  environmentName: string;
  siteName: string;
  webHostname: string;
};

export type BootstrapResult = {
  customerId: string;
  environmentId: string;
  siteId: string;
  publicSiteKey: string;
  privateServerCredential: string;
};

type BootstrapDatabase = Pick<Pool, "connect">;

export class BootstrapError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BootstrapError";
  }
}

/**
 * Creates the first tenant only. This is deliberately not an HTTP operation:
 * generated private credentials must never be reachable by browser clients.
 */
export async function provisionInitialTenant(
  database: BootstrapDatabase,
  input: BootstrapInput,
  writeSecrets: (result: BootstrapResult) => Promise<void> = async () => {},
): Promise<BootstrapResult> {
  const client = await database.connect();
  let committed = false;

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [bootstrapLockId]);

    const existingCustomers = await client.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM tracecaptcha_customers) AS "exists"',
    );

    if (existingCustomers.rows[0]?.exists === true) {
      throw new BootstrapError(
        "Bootstrap is available only while no TraceCAPTCHA customer exists.",
      );
    }

    const customerId = randomUUID();
    const environmentId = randomUUID();
    const siteId = randomUUID();
    const [publicSiteCredential, privateServerCredential] = await Promise.all([
      issueSiteCredential({
        siteId,
        kind: "public_site_key",
        label: "initial browser site key",
      }),
      issueSiteCredential({
        siteId,
        kind: "private_server_credential",
        label: "initial server credential",
      }),
    ]);

    await client.query(
      "INSERT INTO tracecaptcha_customers (id, name) VALUES ($1, $2)",
      [customerId, input.customerName],
    );
    await client.query(
      "INSERT INTO tracecaptcha_environments (id, customer_id, name) VALUES ($1, $2, $3)",
      [environmentId, customerId, input.environmentName],
    );
    await client.query(
      "INSERT INTO tracecaptcha_sites (id, customer_id, environment_id, name) VALUES ($1, $2, $3, $4)",
      [siteId, customerId, environmentId, input.siteName],
    );
    await client.query(
      "INSERT INTO tracecaptcha_site_identifiers (site_id, kind, value) VALUES ($1, 'web_hostname', $2)",
      [siteId, input.webHostname],
    );

    for (const credential of [
      publicSiteCredential.record,
      privateServerCredential.record,
    ]) {
      await client.query(
        "INSERT INTO tracecaptcha_site_credentials (id, site_id, credential_kind, key_id, secret_hash, label, status) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          credential.id,
          credential.siteId,
          credential.kind,
          credential.keyId,
          credential.secretHash,
          credential.label ?? null,
          credential.status,
        ],
      );
    }

    for (const action of initialProtectedActions) {
      const policy = initialActionPolicyDefaults[action];
      await client.query(
        "INSERT INTO tracecaptcha_site_action_policies (id, site_id, action, version, low_risk_decision, elevated_risk_decision, high_risk_decision, severe_risk_decision) VALUES ($1, $2, $3, 1, $4, $5, $6, $7)",
        [
          randomUUID(),
          siteId,
          action,
          policy.lowRiskDecision,
          policy.elevatedRiskDecision,
          policy.highRiskDecision,
          policy.severeRiskDecision,
        ],
      );
    }

    const result = {
      customerId,
      environmentId,
      siteId,
      publicSiteKey: publicSiteCredential.credential,
      privateServerCredential: privateServerCredential.credential,
    };
    await writeSecrets(result);

    await client.query("COMMIT");
    committed = true;

    return result;
  } catch (error) {
    if (!committed) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // The original error remains the useful failure signal.
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

export function loadBootstrapInput(
  environment: NodeJS.ProcessEnv = process.env,
): { databaseUrl: string; outputPath: string; input: BootstrapInput } {
  const parsed = bootstrapEnvironmentSchema.safeParse(environment);

  if (!parsed.success) {
    throw new BootstrapError(
      "Invalid bootstrap configuration. Set the required TRACE_CAPTCHA_BOOTSTRAP_* variables and explicitly confirm with TRACE_CAPTCHA_BOOTSTRAP_CONFIRM=provision.",
    );
  }

  if (!isAbsolute(parsed.data.TRACE_CAPTCHA_BOOTSTRAP_OUTPUT_PATH)) {
    throw new BootstrapError(
      "TRACE_CAPTCHA_BOOTSTRAP_OUTPUT_PATH must be an absolute path to a new secret file.",
    );
  }

  return {
    databaseUrl: parsed.data.TRACE_CAPTCHA_DATABASE_URL,
    outputPath: parsed.data.TRACE_CAPTCHA_BOOTSTRAP_OUTPUT_PATH,
    input: {
      customerName: parsed.data.TRACE_CAPTCHA_BOOTSTRAP_CUSTOMER_NAME,
      environmentName: parsed.data.TRACE_CAPTCHA_BOOTSTRAP_ENVIRONMENT,
      siteName: parsed.data.TRACE_CAPTCHA_BOOTSTRAP_SITE_NAME,
      webHostname: normalizeWebHostname(
        parsed.data.TRACE_CAPTCHA_BOOTSTRAP_WEB_HOSTNAME,
      ),
    },
  };
}

export async function writeBootstrapSecretFile(
  outputPath: string,
  result: BootstrapResult,
): Promise<void> {
  const file = await open(outputPath, "wx", 0o600);

  try {
    await file.writeFile(
      `${JSON.stringify(
        {
          customerId: result.customerId,
          environmentId: result.environmentId,
          siteId: result.siteId,
          publicSiteKey: result.publicSiteKey,
          privateServerCredential: result.privateServerCredential,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  } finally {
    await file.close();
  }
}

export async function runBootstrap(
  environment: NodeJS.ProcessEnv = process.env,
  output: Pick<NodeJS.WriteStream, "write"> = process.stdout,
): Promise<void> {
  const { databaseUrl, outputPath, input } = loadBootstrapInput(environment);
  const database = new Pool({ connectionString: databaseUrl });

  try {
    await provisionInitialTenant(database, input, async (result) => {
      await writeBootstrapSecretFile(outputPath, result);
    });
    output.write(
      `TraceCAPTCHA bootstrap completed. Credential material was written to ${outputPath}.\n`,
    );
  } finally {
    await database.end();
  }
}

function normalizeWebHostname(value: string): string {
  if (value !== value.toLowerCase()) {
    throw new BootstrapError(
      "TRACE_CAPTCHA_BOOTSTRAP_WEB_HOSTNAME must be lowercase and contain only a hostname.",
    );
  }

  try {
    const parsed = new URL(`http://${value}`);

    if (
      parsed.hostname !== value ||
      parsed.port !== "" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      throw new BootstrapError(
        "TRACE_CAPTCHA_BOOTSTRAP_WEB_HOSTNAME must contain only a hostname, without a scheme, port, or path.",
      );
    }

    return parsed.hostname;
  } catch (error) {
    if (error instanceof BootstrapError) {
      throw error;
    }

    throw new BootstrapError(
      "TRACE_CAPTCHA_BOOTSTRAP_WEB_HOSTNAME must contain only a valid lowercase hostname.",
    );
  }
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  void runBootstrap().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "TraceCAPTCHA bootstrap failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
