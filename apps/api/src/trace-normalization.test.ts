import assert from "node:assert/strict";
import test from "node:test";

import {
  maximumTraceDurationMs,
  maximumTracePoints,
  normalizeTrace,
  normalizedTracePointCount,
  TraceValidationError,
} from "./trace-normalization.js";
import { verifyChallengeRequestSchema } from "./schemas.js";

const challenge = {
  canvas: { width: 320, height: 220 },
  canonicalTarget: {
    type: "polygon" as const,
    normalizedPath: [
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 0.75, y: 0.75 },
      { x: 0.25, y: 0.75 },
    ],
  },
};

test("normalizes, de-duplicates, closes, and resamples server-bound paths", () => {
  const normalized = normalizeTrace(
    [
      { x: 80, y: 55, t: 0 },
      { x: 80, y: 55, t: 10 },
      { x: 240, y: 55, t: 20 },
      { x: 240, y: 165, t: 30 },
      { x: 80, y: 165, t: 40 },
      { x: 80, y: 55, t: 50 },
    ],
    challenge,
  );

  assert.equal(normalized.trace.length, normalizedTracePointCount);
  assert.equal(normalized.target.length, normalizedTracePointCount);
  assert.deepEqual(normalized.trace[0], { x: 0.25, y: 0.25, t: 0 });
  assert.deepEqual(normalized.trace.at(-1), { x: 0.25, y: 0.25, t: 50 });
  assert.deepEqual(normalized.target[0], { x: 0.25, y: 0.25 });
  assert.deepEqual(normalized.target.at(-1), { x: 0.25, y: 0.25 });
  assert.equal(normalized.durationMs, 50);
});

test("rejects malformed, out-of-canvas, and oversized traces", () => {
  assertInvalid([
    { x: 0, y: 0, t: 0 },
    { x: 321, y: 0, t: 1 },
  ]);
  assertInvalid([
    { x: 0, y: 0, t: 0 },
    { x: 1, y: 1, t: 1, extra: true },
  ]);
  assertInvalid([
    { x: 0, y: 0, t: 0 },
    { x: Number.NaN, y: 1, t: 1 },
  ]);
  assertInvalid(
    Array.from({ length: maximumTracePoints + 1 }, (_, index) => ({
      x: index % 320,
      y: index % 220,
      t: index,
    })),
  );
});

test("rejects impossible timestamp sequences and degenerate movement", () => {
  assertInvalid([
    { x: 0, y: 0, t: 1 },
    { x: 1, y: 1, t: 2 },
  ]);
  assertInvalid([
    { x: 0, y: 0, t: 0 },
    { x: 1, y: 1, t: 0.5 },
  ]);
  assertInvalid([
    { x: 0, y: 0, t: 0 },
    { x: 1, y: 1, t: 2 },
    { x: 2, y: 2, t: 1 },
  ]);
  assertInvalid([
    { x: 0, y: 0, t: 0 },
    { x: 1, y: 1, t: maximumTraceDurationMs + 1 },
  ]);
  assertInvalid([
    { x: 0, y: 0, t: 0 },
    { x: 0, y: 0, t: 10 },
  ]);
});

test("resampling bounds a valid maximum-sized trace for downstream scoring", () => {
  const source = Array.from({ length: maximumTracePoints }, (_, index) => ({
    x: (index / (maximumTracePoints - 1)) * challenge.canvas.width,
    y: (index / (maximumTracePoints - 1)) * challenge.canvas.height,
    t: Math.round((index / (maximumTracePoints - 1)) * maximumTraceDurationMs),
  }));
  const normalized = normalizeTrace(source, challenge);

  assert.equal(normalized.trace.length, normalizedTracePointCount);
  assert.deepEqual(normalized.trace[0], { x: 0, y: 0, t: 0 });
  assert.deepEqual(normalized.trace.at(-1), {
    x: 1,
    y: 1,
    t: maximumTraceDurationMs,
  });
});

test("rejects impossible timestamp sequences at the request boundary", () => {
  assert.equal(
    verifyChallengeRequestSchema.safeParse({
      action: "signup",
      trace: [
        { x: 0, y: 0, t: 0 },
        { x: 1, y: 1, t: 1 },
      ],
    }).success,
    true,
  );
  assert.equal(
    verifyChallengeRequestSchema.safeParse({
      action: "signup",
      trace: [
        { x: 0, y: 0, t: 1 },
        { x: 1, y: 1, t: 2 },
      ],
    }).success,
    false,
  );
  assert.equal(
    verifyChallengeRequestSchema.safeParse({
      action: "signup",
      trace: [
        { x: 0, y: 0, t: 0 },
        { x: 1, y: 1, t: 2 },
        { x: 2, y: 2, t: 1 },
      ],
    }).success,
    false,
  );
});

function assertInvalid(trace: unknown): void {
  assert.throws(
    () => normalizeTrace(trace, challenge),
    (error: unknown) => error instanceof TraceValidationError,
  );
}
