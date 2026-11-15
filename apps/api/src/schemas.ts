import { z } from "zod";
import { initialProtectedActions } from "@tracecaptcha/shared-types";

const protectedActionSchema = z.enum(initialProtectedActions);
const identifierSchema = z.string().min(1).max(255);

export const siteKeyHeadersSchema = z
  .object({
    "x-tracecaptcha-site-key": z.string().min(1),
  })
  .passthrough();

export const idempotencyKeyHeadersSchema = z
  .object({ "idempotency-key": identifierSchema.optional() })
  .passthrough();

export const secretKeyHeadersSchema = z
  .object({
    "x-tracecaptcha-secret-key": z.string().min(1),
  })
  .passthrough();

export const decisionRequestSchema = z
  .object({
    action: protectedActionSchema,
    sessionId: identifierSchema.optional(),
    context: z
      .object({
        attemptId: z.string().max(255).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const createChallengeRequestSchema = z
  .object({
    action: protectedActionSchema,
    sessionId: identifierSchema.optional(),
    decisionId: identifierSchema.optional(),
  })
  .strict();

export const challengeIdParamsSchema = z
  .object({
    challengeId: z.string().min(1),
  })
  .strict();

const tracePointSchema = z
  .object({
    x: z.number().min(0).max(1_024),
    y: z.number().min(0).max(1_024),
    t: z.number().int().min(0).max(120_000),
  })
  .strict();

const traceSchema = z
  .array(tracePointSchema)
  .min(2)
  .max(2_000)
  .superRefine((trace, context) => {
    if (trace[0]?.t !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The first trace timestamp must be zero.",
        path: [0, "t"],
      });
    }

    for (let index = 1; index < trace.length; index += 1) {
      const current = trace[index];
      const previous = trace[index - 1];

      if (
        current !== undefined &&
        previous !== undefined &&
        current.t < previous.t
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Trace timestamps must not decrease.",
          path: [index, "t"],
        });
      }
    }
  });

export const verifyChallengeRequestSchema = z
  .object({
    action: protectedActionSchema,
    trace: traceSchema,
  })
  .strict();

export const challengeAbandonmentRequestSchema = z
  .object({
    action: protectedActionSchema,
  })
  .strict();

export const verifyTokenRequestSchema = z
  .object({
    token: z.string().min(1),
    expectedAction: protectedActionSchema,
    consume: z.boolean().default(true),
  })
  .strict();

export const falsePositiveReportRequestSchema = z
  .object({
    action: protectedActionSchema,
  })
  .strict();
