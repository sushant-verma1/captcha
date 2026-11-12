import assert from "node:assert/strict";
import test from "node:test";

import { calculateTraceGeometry } from "./trace-geometry.js";
import {
  calculateTraceNaturalness,
  hasEffectivelyIdenticalTrace,
} from "./trace-naturalness.js";
import { normalizeTrace } from "./trace-normalization.js";

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

test("keeps geometry separate from timing and spacing regularity", () => {
  const synthetic = normalizeTrace(uniformSquareTrace(), challenge);
  const natural = normalizeTrace(irregularSquareTrace(), challenge);
  const syntheticNaturalness = calculateTraceNaturalness(synthetic);
  const naturalNaturalness = calculateTraceNaturalness(natural);

  assert.equal(calculateTraceGeometry(synthetic).meanDistanceToTarget, 0);
  assert.equal(calculateTraceGeometry(natural).meanDistanceToTarget, 0);
  assert.equal(syntheticNaturalness.hasHighlyUniformTiming, true);
  assert.equal(syntheticNaturalness.hasHighlyUniformSpacing, true);
  assert.ok(naturalNaturalness.timingIntervalCoefficientOfVariation > 0.2);
  assert.ok(naturalNaturalness.pointSpacingCoefficientOfVariation > 0.2);
  assert.equal(naturalNaturalness.hasHighlyUniformTiming, false);
  assert.equal(naturalNaturalness.hasHighlyUniformSpacing, false);
});

test("summarizes duration and pauses without retaining raw trace points", () => {
  const metrics = calculateTraceNaturalness(
    normalizeTrace(
      [
        { x: 80, y: 55, t: 0 },
        { x: 160, y: 55, t: 20 },
        { x: 240, y: 55, t: 220 },
      ],
      challenge,
    ),
  );

  assert.equal(metrics.durationMs, 220);
  assert.equal(metrics.maximumInterEventIntervalMs, 200);
  assert.ok(metrics.longestPauseShare > 0.9);
});

test("identifies only effectively identical traces provided by the caller", () => {
  const trace = normalizeTrace(uniformSquareTrace(), challenge);
  const nearCopy = normalizeTrace(
    uniformSquareTrace().map((point, index) => ({
      ...point,
      x: point.x + (index === 4 ? 1 : 0),
    })),
    challenge,
  );

  assert.equal(hasEffectivelyIdenticalTrace(trace, [trace]), true);
  assert.equal(hasEffectivelyIdenticalTrace(trace, [nearCopy]), false);
  assert.equal(hasEffectivelyIdenticalTrace(trace, []), false);
});

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
