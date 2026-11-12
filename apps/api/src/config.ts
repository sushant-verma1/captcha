import { z } from "zod";

import {
  loadEnvironmentTokenKeyConfig,
  type EnvironmentTokenKeyConfig,
} from "./environment-token-keys.js";

const environmentSchema = z.enum(["development", "test", "production"]);
const logLevelSchema = z.enum([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
]);

const configSchema = z.object({
  NODE_ENV: environmentSchema.default("development"),
  TRACE_CAPTCHA_HOST: z.string().min(1).default("127.0.0.1"),
  TRACE_CAPTCHA_PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  TRACE_CAPTCHA_LOG_LEVEL: logLevelSchema.default("info"),
  TRACE_CAPTCHA_REDIS_URL: z.string().url(),
  TRACE_CAPTCHA_DATABASE_URL: z.string().url(),
  TRACE_CAPTCHA_TOKEN_ISSUER: z.string().url(),
  TRACE_CAPTCHA_TOKEN_ACTIVE_KEY_ID: z.string().min(1).max(255),
  TRACE_CAPTCHA_TOKEN_SIGNING_KEY_PEM: z.string().min(1),
  TRACE_CAPTCHA_TOKEN_RETIRING_PUBLIC_KEYS: z.string().optional(),
});

export type TokenSigningConfig = {
  issuer: string;
  keyConfig: EnvironmentTokenKeyConfig;
};

export type AppConfig = {
  environment: z.infer<typeof environmentSchema>;
  host: string;
  port: number;
  logLevel: z.infer<typeof logLevelSchema>;
  redisUrl: string;
  databaseUrl: string;
  tokenSigning: TokenSigningConfig;
};

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const parsed = configSchema.safeParse(environment);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid TraceCAPTCHA configuration: ${details}`);
  }

  let keyConfig: EnvironmentTokenKeyConfig;

  try {
    keyConfig = loadEnvironmentTokenKeyConfig(environment);
  } catch {
    throw new Error("Invalid TraceCAPTCHA token-signing configuration.");
  }

  return {
    environment: parsed.data.NODE_ENV,
    host: parsed.data.TRACE_CAPTCHA_HOST,
    port: parsed.data.TRACE_CAPTCHA_PORT,
    logLevel: parsed.data.TRACE_CAPTCHA_LOG_LEVEL,
    redisUrl: parsed.data.TRACE_CAPTCHA_REDIS_URL,
    databaseUrl: parsed.data.TRACE_CAPTCHA_DATABASE_URL,
    tokenSigning: {
      issuer: parsed.data.TRACE_CAPTCHA_TOKEN_ISSUER,
      keyConfig,
    },
  };
}
