import { Pool } from "pg";
import { createClient } from "redis";

import { ChallengeCreationService } from "./challenge-creation.js";
import { ChallengeVerificationService } from "./challenge-verification.js";
import { createRedisChallengeStore } from "./challenge-store.js";
import { loadConfig } from "./config.js";
import { createEnvironmentTokenKeyProviders } from "./environment-token-keys.js";
import { FalsePositiveReportingService } from "./false-positive-reporting.js";
import { RedisIdempotencyStore } from "./idempotency.js";
import { PostgresOperationalMetricsRecorder } from "./operational-metrics.js";
import { RiskDecisionService } from "./risk-decision.js";
import { RedisRiskFeatureSummaryStore } from "./risk-feature-store.js";
import { PostgresRiskPolicyLookup } from "./risk-policy-repository.js";
import { RateLimiter, RedisRateLimitCounterStore } from "./rate-limit.js";
import { PostgresRateLimitPolicyLookup } from "./rate-limit-policy-repository.js";
import { buildServer } from "./server.js";
import { ServerTokenVerificationService } from "./server-token-verification.js";
import { PostgresBrowserSiteCredentialLookup } from "./site-credential-repository.js";
import {
  RedisVerificationTokenConsumptionStore,
  VerificationTokenVerifier,
} from "./token-verification.js";
import { VerificationTokenSigner } from "./token-signing.js";

const config = loadConfig();
const redis = createClient({ url: config.redisUrl });
const database = new Pool({ connectionString: config.databaseUrl });
const tokenKeyProviders = await createEnvironmentTokenKeyProviders(
  config.tokenSigning.keyConfig,
);
const credentialLookup = new PostgresBrowserSiteCredentialLookup(database);
const rateLimiter = new RateLimiter(
  new RedisRateLimitCounterStore(redis),
  new PostgresRateLimitPolicyLookup(database),
);
const operationalMetrics = new PostgresOperationalMetricsRecorder(database);
const falsePositiveReporter = new FalsePositiveReportingService(
  credentialLookup,
  operationalMetrics,
);
const challengeCreator = new ChallengeCreationService(
  credentialLookup,
  createRedisChallengeStore(redis),
  undefined,
  rateLimiter,
  new RedisIdempotencyStore(redis),
  operationalMetrics,
);
const challengeVerifier = new ChallengeVerificationService(
  credentialLookup,
  createRedisChallengeStore(redis),
  new VerificationTokenSigner({
    issuer: config.tokenSigning.issuer,
    keyProvider: tokenKeyProviders.signingKeyProvider,
  }),
  undefined,
  rateLimiter,
  operationalMetrics,
);
const tokenVerifier = new VerificationTokenVerifier({
  keyProvider: tokenKeyProviders.verificationKeyProvider,
  consumptionStore: new RedisVerificationTokenConsumptionStore(redis),
});
const tokenVerificationService = new ServerTokenVerificationService(
  credentialLookup,
  tokenVerifier,
  config.tokenSigning.issuer,
);
const riskDecisionService = new RiskDecisionService(
  credentialLookup,
  new RedisRiskFeatureSummaryStore(redis),
  new PostgresRiskPolicyLookup(database),
  undefined,
  rateLimiter,
  operationalMetrics,
);
const server = buildServer(config, {
  challengeCreator,
  challengeVerifier,
  riskDecisionService,
  tokenVerifier: tokenVerificationService,
  falsePositiveReporter,
  readinessChecks: [
    async () => redis.isReady && (await redis.ping()) === "PONG",
    async () => {
      await database.query("SELECT 1");
      return true;
    },
    async () =>
      (await tokenKeyProviders.verificationKeyProvider.getVerificationKey(
        config.tokenSigning.keyConfig.activeKeyId,
      )) !== null,
  ],
});

try {
  await redis.connect();
  await database.query("SELECT 1");
  await server.listen({ host: config.host, port: config.port });
} catch (error) {
  server.log.error(error);
  process.exitCode = 1;
} finally {
  if (server.server.listening) {
    await server.close();
  }

  if (redis.isOpen) {
    await redis.quit();
  }

  await database.end();
}
