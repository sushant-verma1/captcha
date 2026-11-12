import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";

import type { ChallengeCreationService } from "./challenge-creation.js";
import type { ChallengeVerificationService } from "./challenge-verification.js";
import type { AppConfig } from "./config.js";
import { ApiError } from "./errors.js";
import type { FalsePositiveReportingService } from "./false-positive-reporting.js";
import type { RiskDecisionService } from "./risk-decision.js";
import { registerV1Routes } from "./routes.js";
import type { ServerTokenVerificationService } from "./server-token-verification.js";

export type ReadinessCheck = () => boolean | Promise<boolean>;

export type ServerOptions = {
  readinessChecks?: readonly ReadinessCheck[];
  challengeCreator?: ChallengeCreationService;
  challengeVerifier?: ChallengeVerificationService;
  riskDecisionService?: RiskDecisionService;
  tokenVerifier?: ServerTokenVerificationService;
  falsePositiveReporter?: FalsePositiveReportingService;
};

export function buildServer(
  config: AppConfig,
  {
    readinessChecks = [],
    challengeCreator,
    challengeVerifier,
    riskDecisionService,
    tokenVerifier,
    falsePositiveReporter,
  }: ServerOptions = {},
): FastifyInstance {
  const server = Fastify({
    logger: {
      level: config.logLevel,
      redact: [
        "req.headers.authorization",
        "req.headers.x-tracecaptcha-secret-key",
        "req.body.token",
        "req.body.verificationToken",
      ],
    },
    bodyLimit: 128 * 1024,
  });

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "validation_error",
          message: "The request contains invalid fields.",
        },
      });
    }

    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    server.log.error(error);

    return reply.status(500).send({
      error: {
        code: "internal_error",
        message: "An unexpected error occurred.",
      },
    });
  });

  server.get("/health/live", async () => ({ status: "ok" }));

  server.get("/health/ready", async (_request, reply) => {
    const results = await Promise.allSettled(
      readinessChecks.map((check) => Promise.resolve().then(check)),
    );
    const isReady = results.every(
      (result) => result.status === "fulfilled" && result.value,
    );

    return reply.status(isReady ? 200 : 503).send({
      status: isReady ? "ready" : "unavailable",
    });
  });

  server.get("/v1", async () => ({
    service: "tracecaptcha",
    version: "v1",
  }));

  registerV1Routes(server, {
    ...(challengeCreator === undefined ? {} : { challengeCreator }),
    ...(challengeVerifier === undefined ? {} : { challengeVerifier }),
    ...(riskDecisionService === undefined ? {} : { riskDecisionService }),
    ...(tokenVerifier === undefined ? {} : { tokenVerifier }),
    ...(falsePositiveReporter === undefined ? {} : { falsePositiveReporter }),
  });

  return server;
}
