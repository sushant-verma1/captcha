const supportedActions = [
  "signup",
  "login",
  "password_reset",
  "otp_request",
] as const;

export type TestHarnessAction = (typeof supportedActions)[number];

export type TestHarnessConfig = {
  apiOrigin: string;
  publicOrigin: string;
  publicSiteKey: string;
  privateServerCredential: string;
  action: TestHarnessAction;
  host: string;
  port: number;
};

export class TestHarnessConfigurationError extends Error {
  public constructor() {
    super("Invalid TraceCAPTCHA test-harness configuration.");
    this.name = "TestHarnessConfigurationError";
  }
}

export function loadTestHarnessConfig(
  environment: NodeJS.ProcessEnv = process.env,
): TestHarnessConfig {
  const apiOrigin = parseOrigin(
    environment.TRACE_CAPTCHA_TEST_HARNESS_API_ORIGIN,
  );
  const publicOrigin = parseOrigin(
    environment.TRACE_CAPTCHA_TEST_HARNESS_PUBLIC_ORIGIN,
  );
  const publicSiteKey = requireCredential(
    environment.TRACE_CAPTCHA_TEST_HARNESS_SITE_KEY,
    "tc_site_",
  );
  const privateServerCredential = requireCredential(
    environment.TRACE_CAPTCHA_TEST_HARNESS_SECRET_KEY,
    "tc_server_",
  );
  const action = parseAction(environment.TRACE_CAPTCHA_TEST_HARNESS_ACTION);
  const host = environment.TRACE_CAPTCHA_TEST_HARNESS_HOST ?? "0.0.0.0";
  const port = parsePort(environment.PORT ?? "3001");

  if (host.trim().length === 0) {
    throw new TestHarnessConfigurationError();
  }

  return {
    apiOrigin,
    publicOrigin,
    publicSiteKey,
    privateServerCredential,
    action,
    host,
    port,
  };
}

function parseOrigin(value: string | undefined): string {
  if (value === undefined) {
    throw new TestHarnessConfigurationError();
  }

  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.origin !== value
    ) {
      throw new TestHarnessConfigurationError();
    }
    return parsed.origin;
  } catch (error) {
    if (error instanceof TestHarnessConfigurationError) {
      throw error;
    }
    throw new TestHarnessConfigurationError();
  }
}

function requireCredential(
  value: string | undefined,
  prefix: "tc_site_" | "tc_server_",
): string {
  if (
    value === undefined ||
    !value.startsWith(prefix) ||
    value.length > 1_024
  ) {
    throw new TestHarnessConfigurationError();
  }
  return value;
}

function parseAction(value: string | undefined): TestHarnessAction {
  if (value === undefined) {
    return "password_reset";
  }
  if (supportedActions.includes(value as TestHarnessAction)) {
    return value as TestHarnessAction;
  }
  throw new TestHarnessConfigurationError();
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new TestHarnessConfigurationError();
  }
  return port;
}
