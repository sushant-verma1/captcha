import assert from "node:assert/strict";
import test from "node:test";

import { calculateTraceGeometry } from "./trace-geometry.js";
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

test("calculates inspectable geometry metrics for an accurate ordered trace", () => {
  const metrics = calculateTraceGeometry(
    normalizeTrace(squareTrace(), challenge),
  );

  assert.equal(metrics.meanDistanceToTarget, 0);
  assert.equal(metrics.maximumDistanceToTarget, 0);
  assert.equal(metrics.pointDistanceAtNinetiethPercentile, 0);
  assert.equal(metrics.meanTargetDistance, 0);
  assert.equal(metrics.targetCoverage, 1);
  assert.equal(metrics.orderConsistency, 1);
  assert.ok(Math.abs(metrics.traceTraversalRatio - 1) < 0.01);
  assert.equal(metrics.startDistanceToTarget, 0);
  assert.equal(metrics.endDistanceToTarget, 0);
  assert.equal(metrics.largeJumpCount, 0);
});

test("distinguishes incomplete, offset, reordered, and disconnected traces", () => {
  const incomplete = calculateTraceGeometry(
    normalizeTrace(
      [
        { x: 80, y: 55, t: 0 },
        { x: 240, y: 55, t: 100 },
      ],
      challenge,
    ),
  );
  const offset = calculateTraceGeometry(
    normalizeTrace(
      [
        { x: 120, y: 95, t: 0 },
        { x: 280, y: 95, t: 25 },
        { x: 280, y: 205, t: 50 },
        { x: 120, y: 205, t: 75 },
        { x: 120, y: 95, t: 100 },
      ],
      challenge,
    ),
  );
  const reverseDirection = calculateTraceGeometry(
    normalizeTrace(
      [
        { x: 80, y: 55, t: 0 },
        { x: 80, y: 165, t: 25 },
        { x: 240, y: 165, t: 50 },
        { x: 240, y: 55, t: 75 },
        { x: 80, y: 55, t: 100 },
      ],
      challenge,
    ),
  );
  const backtracking = calculateTraceGeometry(
    normalizeTrace(
      [
        { x: 80, y: 55, t: 0 },
        { x: 240, y: 55, t: 25 },
        { x: 80, y: 55, t: 50 },
        { x: 80, y: 165, t: 75 },
        { x: 80, y: 55, t: 100 },
      ],
      challenge,
    ),
  );
  const disconnected = calculateTraceGeometry(
    normalizeTrace(
      [
        { x: 80, y: 55, t: 0 },
        { x: 240, y: 55, t: 25 },
        { x: 80, y: 165, t: 50 },
      ],
      challenge,
    ),
  );

  assert.ok(incomplete.targetCoverage < 0.35);
  assert.ok(offset.meanDistanceToTarget > 0.1);
  assert.equal(reverseDirection.orderConsistency, 1);
  assert.ok(backtracking.orderConsistency < 0.7);
  assert.ok(disconnected.maximumStepDistance > 0.5);
  assert.equal(disconnected.largeJumpCount, 1);
});

function squareTrace() {
  return [
    { x: 80, y: 55, t: 0 },
    { x: 240, y: 55, t: 25 },
    { x: 240, y: 165, t: 50 },
    { x: 80, y: 165, t: 75 },
    { x: 80, y: 55, t: 100 },
  ];
}
