import assert from "node:assert/strict";
import test from "node:test";

import type { TraceGeometryMetrics } from "./trace-geometry.js";
import type { TraceNaturalnessMetrics } from "./trace-naturalness.js";
import { assessTrace } from "./trace-policy.js";

const excellentGeometry: TraceGeometryMetrics = {
  meanDistanceToTarget: 0.01,
  maximumDistanceToTarget: 0.03,
  meanTargetDistance: 0.01,
  targetCoverage: 0.95,
  orderConsistency: 0.95,
  startDistanceToTarget: 0.01,
  endDistanceToTarget: 0.01,
  maximumStepDistance: 0.03,
  largeJumpCount: 0,
};

const irregularNaturalness: TraceNaturalnessMetrics = {
  durationMs: 850,
  medianInterEventIntervalMs: 42,
  maximumInterEventIntervalMs: 180,
  longestPauseShare: 0.21,
  timingIntervalCoefficientOfVariation: 0.42,
  pointSpacingCoefficientOfVariation: 0.37,
  hasHighlyUniformTiming: false,
  hasHighlyUniformSpacing: false,
};

test("passes excellent geometry without suspicious combined regularity", () => {
  const assessment = assessTrace(excellentGeometry, irregularNaturalness);

  assert.deepEqual(assessment, {
    outcome: "pass",
    policyVersion: "provisional-v1",
    calibrationRequired: true,
    geometryReasons: [],
    naturalnessSignals: [],
  });
});

test("retries incomplete or disconnected geometry before naturalness policy", () => {
  const assessment = assessTrace(
    {
      ...excellentGeometry,
      targetCoverage: 0.4,
      largeJumpCount: 1,
    },
    {
      ...irregularNaturalness,
      hasHighlyUniformTiming: true,
      hasHighlyUniformSpacing: true,
    },
    { hasEffectivelyIdenticalPriorTrace: true },
  );

  assert.equal(assessment.outcome, "retry");
  assert.deepEqual(assessment.geometryReasons, [
    "target_incomplete",
    "disconnected_trace",
  ]);
  assert.deepEqual(assessment.naturalnessSignals, [
    "highly_uniform_timing",
    "highly_uniform_spacing",
    "repeated_trace",
  ]);
});

test("does not penalize one regularity signal by itself", () => {
  const assessment = assessTrace(excellentGeometry, {
    ...irregularNaturalness,
    hasHighlyUniformTiming: true,
  });

  assert.equal(assessment.outcome, "pass");
  assert.deepEqual(assessment.naturalnessSignals, ["highly_uniform_timing"]);
});

test("retries combined regularity and escalates only when it repeats", () => {
  const highlyRegular: TraceNaturalnessMetrics = {
    ...irregularNaturalness,
    hasHighlyUniformTiming: true,
    hasHighlyUniformSpacing: true,
  };

  assert.equal(assessTrace(excellentGeometry, highlyRegular).outcome, "retry");
  assert.equal(
    assessTrace(excellentGeometry, highlyRegular, {
      hasEffectivelyIdenticalPriorTrace: true,
    }).outcome,
    "escalate",
  );
});
