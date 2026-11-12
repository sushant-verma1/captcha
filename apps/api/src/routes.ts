import type { FastifyInstance } from "fastify";
import type { ChallengeCreationService } from "./challenge-creation.js";
import type { ChallengeVerificationService } from "./challenge-verification.js";
import { ApiError } from "./errors.js";
import type { FalsePositiveReportingService } from "./false-positive-reporting.js";
import type { RiskDecisionService } from "./risk-decision.js";
import type { ServerTokenVerificationService } from "./server-token-verification.js";
import {
  challengeIdParamsSchema,
  createChallengeRequestSchema,
  decisionRequestSchema,
  falsePositiveReportRequestSchema,
  idempotencyKeyHeadersSchema,
  secretKeyHeadersSchema,
  siteKeyHeadersSchema,
  verifyChallengeRequestSchema,
  verifyTokenRequestSchema,
} from "./schemas.js";

function notImplemented(): never {
  throw new ApiError(
    501,
    "not_implemented",
    "This API operation is not available yet.",
  );
}

function requireSiteKey(headers: unknown): string {
  const parsed = siteKeyHeadersSchema.safeParse(headers);

  if (!parsed.success) {
    throw new ApiError(
      401,
      "invalid_site_key",
      "The site key is missing or invalid.",
    );
  }

  return parsed.data["x-tracecaptcha-site-key"];
}

function requireSecretKey(headers: unknown): string {
  const parsed = secretKeyHeadersSchema.safeParse(headers);

  if (!parsed.success) {
    throw new ApiError(
      401,
      "invalid_secret_key",
      "The secret key is missing or invalid.",
    );
  }

  return parsed.data["x-tracecaptcha-secret-key"];
}

function optionalIdempotencyKey(headers: unknown): string | undefined {
  const parsed = idempotencyKeyHeadersSchema.safeParse(headers);
  if (!parsed.success) {
    throw new ApiError(
      400,
      "invalid_idempotency_key",
      "The idempotency key is invalid.",
    );
  }

  return parsed.data["idempotency-key"];
}

export function registerV1Routes(
  server: FastifyInstance,
  {
    challengeCreator,
    challengeVerifier,
    riskDecisionService,
    tokenVerifier,
    falsePositiveReporter,
  }: {
    challengeCreator?: ChallengeCreationService;
    challengeVerifier?: ChallengeVerificationService;
    riskDecisionService?: RiskDecisionService;
    tokenVerifier?: ServerTokenVerificationService;
    falsePositiveReporter?: FalsePositiveReportingService;
  } = {},
): void {
  server.options("/v1/challenges", async (request, reply) => {
    const origin = request.headers.origin;

    if (typeof origin !== "string") {
      return reply.status(400).send();
    }

    return reply
      .header("Access-Control-Allow-Origin", origin)
      .header(
        "Access-Control-Allow-Headers",
        "Content-Type, X-TraceCAPTCHA-Site-Key, Idempotency-Key",
      )
      .header("Access-Control-Allow-Methods", "POST, OPTIONS")
      .header("Vary", "Origin")
      .status(204)
      .send();
  });

  server.options("/v1/decisions", async (request, reply) => {
    const origin = request.headers.origin;

    if (typeof origin !== "string") {
      return reply.status(400).send();
    }

    return reply
      .header("Access-Control-Allow-Origin", origin)
      .header(
        "Access-Control-Allow-Headers",
        "Content-Type, X-TraceCAPTCHA-Site-Key",
      )
      .header("Access-Control-Allow-Methods", "POST, OPTIONS")
      .header("Vary", "Origin")
      .status(204)
      .send();
  });

  server.options(
    "/v1/challenges/:challengeId/verify",
    async (request, reply) => {
      const origin = request.headers.origin;

      if (typeof origin !== "string") {
        return reply.status(400).send();
      }

      return reply
        .header("Access-Control-Allow-Origin", origin)
        .header(
          "Access-Control-Allow-Headers",
          "Content-Type, X-TraceCAPTCHA-Site-Key",
        )
        .header("Access-Control-Allow-Methods", "POST, OPTIONS")
        .header("Vary", "Origin")
        .status(204)
        .send();
    },
  );

  server.post("/v1/decisions", async (request, reply) => {
    const siteKey = requireSiteKey(request.headers);
    const body = decisionRequestSchema.parse(request.body);
    const origin = request.headers.origin;

    if (typeof origin !== "string") {
      throw new ApiError(
        401,
        "invalid_site_key",
        "The site key is missing or invalid.",
      );
    }

    if (riskDecisionService === undefined) {
      return notImplemented();
    }

    const result = await riskDecisionService.decide({
      siteKey,
      origin,
      action: body.action,
      ...(body.sessionId === undefined ? {} : { sessionId: body.sessionId }),
      ...(body.context?.attemptId === undefined
        ? {}
        : { attemptId: body.context.attemptId }),
      networkAddress: request.ip,
    });

    if (result.outcome === "invalid_site") {
      throw new ApiError(
        401,
        "invalid_site_key",
        "The site key is missing or invalid.",
      );
    }

    if (result.outcome === "unavailable") {
      throw new ApiError(
        503,
        "service_unavailable",
        "Verification is temporarily unavailable. Please try again.",
      );
    }

    if (result.outcome === "rate_limited") {
      return reply
        .header("Retry-After", String(result.retryAfterSeconds))
        .status(429)
        .send({
          error: {
            code: "rate_limited",
            message: "Too many requests. Please try again later.",
          },
        });
    }

    return reply
      .header("Access-Control-Allow-Origin", origin)
      .header("Vary", "Origin")
      .send({
        decisionId: result.decisionId,
        decision: result.decision,
      });
  });

  server.post("/v1/challenges", async (request, reply) => {
    const siteKey = requireSiteKey(request.headers);
    const idempotencyKey = optionalIdempotencyKey(request.headers);
    const body = createChallengeRequestSchema.parse(request.body);

    if (challengeCreator === undefined) {
      return notImplemented();
    }

    const result = await challengeCreator.create({
      siteKey,
      origin: request.headers.origin,
      action: body.action,
      ...(body.sessionId === undefined ? {} : { sessionId: body.sessionId }),
      ...(body.decisionId === undefined ? {} : { decisionId: body.decisionId }),
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      networkAddress: request.ip,
    });

    if (result.outcome === "invalid_site") {
      throw new ApiError(
        401,
        "invalid_site_key",
        "The site key is missing or invalid.",
      );
    }

    if (result.outcome === "unavailable") {
      throw new ApiError(
        503,
        "service_unavailable",
        "Verification is temporarily unavailable. Please try again.",
      );
    }

    if (result.outcome === "idempotency_conflict") {
      throw new ApiError(
        409,
        "idempotency_conflict",
        "The idempotency key cannot be reused for a different request.",
      );
    }

    if (result.outcome === "idempotency_in_progress") {
      throw new ApiError(
        409,
        "idempotency_in_progress",
        "An equivalent request is already in progress. Please retry shortly.",
      );
    }

    if (result.outcome === "rate_limited") {
      return reply
        .header("Retry-After", String(result.retryAfterSeconds))
        .status(429)
        .send({
          error: {
            code: "rate_limited",
            message: "Too many requests. Please try again later.",
          },
        });
    }

    return reply
      .header("Access-Control-Allow-Origin", request.headers.origin)
      .header("Vary", "Origin")
      .status(201)
      .send(result.response);
  });

  server.post("/v1/challenges/:challengeId/verify", async (request, reply) => {
    const siteKey = requireSiteKey(request.headers);
    const { challengeId } = challengeIdParamsSchema.parse(request.params);
    const body = verifyChallengeRequestSchema.parse(request.body);

    if (challengeVerifier === undefined) {
      return notImplemented();
    }

    const result = await challengeVerifier.verify({
      siteKey,
      origin: request.headers.origin,
      challengeId,
      action: body.action,
      trace: body.trace,
      networkAddress: request.ip,
    });

    if (result.outcome === "invalid_site") {
      throw new ApiError(
        401,
        "invalid_site_key",
        "The site key is missing or invalid.",
      );
    }

    if (result.outcome === "invalid_challenge") {
      throw new ApiError(
        404,
        "challenge_not_found",
        "The challenge is not available.",
      );
    }

    if (result.outcome === "expired") {
      throw new ApiError(
        410,
        "challenge_expired",
        "The challenge has expired.",
      );
    }

    if (result.outcome === "consumed") {
      throw new ApiError(
        409,
        "challenge_consumed",
        "The challenge has already been used.",
      );
    }

    if (result.outcome === "rate_limited") {
      return reply
        .header("Retry-After", String(result.retryAfterSeconds))
        .status(429)
        .send({
          error: {
            code: "rate_limited",
            message: "Too many requests. Please try again later.",
          },
        });
    }

    if (result.outcome === "unavailable") {
      throw new ApiError(
        503,
        "service_unavailable",
        "Verification is temporarily unavailable. Please try again.",
      );
    }

    return reply
      .header("Access-Control-Allow-Origin", request.headers.origin)
      .header("Vary", "Origin")
      .send(result.response);
  });

  server.post("/v1/tokens/verify", async (request) => {
    const secretKey = requireSecretKey(request.headers);
    const body = verifyTokenRequestSchema.parse(request.body);

    if (tokenVerifier === undefined) {
      return notImplemented();
    }

    const result = await tokenVerifier.verify({
      secretKey,
      token: body.token,
      expectedAction: body.expectedAction,
      consume: body.consume,
    });

    if (result.outcome === "invalid_secret_key") {
      throw new ApiError(
        401,
        "invalid_secret_key",
        "The secret key is missing or invalid.",
      );
    }

    if (result.outcome === "unavailable") {
      throw new ApiError(
        503,
        "service_unavailable",
        "Verification is temporarily unavailable. Please try again.",
      );
    }

    return result.response;
  });

  server.post(
    "/v1/observability/false-positive-reports",
    async (request, reply) => {
      const secretKey = requireSecretKey(request.headers);
      const body = falsePositiveReportRequestSchema.parse(request.body);

      if (falsePositiveReporter === undefined) {
        return notImplemented();
      }

      const result = await falsePositiveReporter.report({
        secretKey,
        action: body.action,
      });

      if (result.outcome === "invalid_secret_key") {
        throw new ApiError(
          401,
          "invalid_secret_key",
          "The secret key is missing or invalid.",
        );
      }

      if (result.outcome === "unavailable") {
        throw new ApiError(
          503,
          "service_unavailable",
          "The service is temporarily unavailable. Please try again.",
        );
      }

      return reply.status(202).send();
    },
  );
}
