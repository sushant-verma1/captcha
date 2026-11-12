import assert from "node:assert/strict";
import test from "node:test";

import { calculateTraceGeometry } from "./trace-geometry.js";
import { calculateTraceNaturalness } from "./trace-naturalness.js";
import {
  maximumTracePoints,
  normalizeTrace,
  TraceValidationError,
} from "./trace-normalization.js";
import { assessTrace } from "./trace-policy.js";

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

test("captures expected outcomes for accurate and malformed trace categories", () => {
  const accurate = validate(squareTrace());
  const duplicate = validate([
    { x: 80, y: 55, t: 0 },
    { x: 80, y: 55, t: 5 },
    ...squareTrace().slice(1),
  ]);
  const incomplete = validate([
    { x: 80, y: 55, t: 0 },
    { x: 240, y: 55, t: 100 },
  ]);
  const offset = validate([
    { x: 120, y: 95, t: 0 },
    { x: 280, y: 95, t: 25 },
    { x: 280, y: 205, t: 50 },
    { x: 120, y: 205, t: 75 },
    { x: 120, y: 95, t: 100 },
  ]);
  const reordered = validate([
    { x: 80, y: 55, t: 0 },
    { x: 80, y: 165, t: 25 },
    { x: 240, y: 165, t: 50 },
    { x: 240, y: 55, t: 75 },
    { x: 80, y: 55, t: 100 },
  ]);
  const disconnected = validate([
    { x: 80, y: 55, t: 0 },
    { x: 240, y: 55, t: 25 },
    { x: 80, y: 165, t: 50 },
  ]);

  assert.equal(accurate.assessment.outcome, "pass");
  assert.equal(duplicate.assessment.outcome, "pass");
  assert.equal(duplicate.normalized.sourceTrace.length, 5);
  assert.equal(incomplete.assessment.outcome, "retry");
  assert.equal(offset.assessment.outcome, "retry");
  assert.equal(reordered.assessment.outcome, "retry");
  assert.equal(disconnected.assessment.outcome, "retry");
  assert.ok(disconnected.geometry.largeJumpCount > 0);

  assertInvalid([
    { x: 0, y: 0, t: 0 },
    { x: 321, y: 0, t: 1 },
  ]);
  assertInvalid(
    Array.from({ length: maximumTracePoints + 1 }, (_, index) => ({
      x: 0,
      y: 0,
      t: index,
    })),
  );
});

test("keeps perfect geometry distinct from naturalness and is deterministic", () => {
  const natural = validate(irregularSquareTrace());
  const synthetic = validate(uniformSquareTrace());
  const repeatedSynthetic = validate(uniformSquareTrace());

  assert.equal(natural.geometry.meanDistanceToTarget, 0);
  assert.equal(synthetic.geometry.meanDistanceToTarget, 0);
  assert.equal(natural.assessment.outcome, "pass");
  assert.equal(synthetic.assessment.outcome, "retry");
  assert.ok(
    natural.naturalness.timingIntervalCoefficientOfVariation >
      synthetic.naturalness.timingIntervalCoefficientOfVariation,
  );
  assert.deepEqual(synthetic, repeatedSynthetic);
});

function validate(trace: unknown) {
  const normalized = normalizeTrace(trace, challenge);
  const geometry = calculateTraceGeometry(normalized);
  const naturalness = calculateTraceNaturalness(normalized);

  return {
    normalized,
    geometry,
    naturalness,
    assessment: assessTrace(geometry, naturalness),
  };
}

function assertInvalid(trace: unknown): void {
  assert.throws(
    () => normalizeTrace(trace, challenge),
    (error: unknown) => error instanceof TraceValidationError,
  );
}

function squareTrace() {
  return [
    { x: 80, y: 55, t: 0 },
    { x: 240, y: 55, t: 25 },
    { x: 240, y: 165, t: 50 },
    { x: 80, y: 165, t: 75 },
    { x: 80, y: 55, t: 100 },
  ];
}

function uniformSquareTrace() {
  return [
    { x: 80, y: 55, t: 0 },
    { x: 160, y: 55, t: 20 },
    { x: 240, y: 55, t: 40 },
    { x: 240, y: 110, t: 60 },
    { x: 240, y: 165, t: 80 },
    { x: 160, y: 165, t: 100 },
    { x: 80, y: 165, t: 120 },
    { x: 80, y: 110, t: 140 },
    { x: 80, y: 55, t: 160 },
  ];
}

function irregularSquareTrace() {
  return [
    { x: 80, y: 55, t: 0 },
    { x: 104, y: 55, t: 5 },
    { x: 240, y: 55, t: 48 },
    { x: 240, y: 70, t: 57 },
    { x: 240, y: 165, t: 179 },
    { x: 152, y: 165, t: 203 },
    { x: 80, y: 165, t: 271 },
    { x: 80, y: 144, t: 277 },
    { x: 80, y: 55, t: 381 },
  ];
}
