import type { TraceGeometryMetrics } from "./trace-geometry.js";
import type { TraceNaturalnessMetrics } from "./trace-naturalness.js";

export const traceAcceptancePolicyVersion = "provisional-v1";

/**
 * These server-only thresholds are provisional measurement policy, not public
 * API behavior. They require calibration against usability and abuse outcomes
 * before any production rollout; P10.1 remains blocked until that work and
 * human browser/accessibility QA are complete.
 */
const provisionalThresholds = {
  maximumMeanDistanceToTarget: 0.04,
  maximumPointDistanceToTarget: 0.12,
  minimumTargetCoverage: 0.85,
  minimumOrderConsistency: 0.7,
  maximumEndpointDistanceToTarget: 0.08,
} as const;

export type TraceAssessmentOutcome = "pass" | "retry" | "escalate";

export type TraceAssessment = {
  outcome: TraceAssessmentOutcome;
  policyVersion: typeof traceAcceptancePolicyVersion;
  calibrationRequired: true;
  geometryReasons: string[];
  naturalnessSignals: string[];
};

export function assessTrace(
  geometry: TraceGeometryMetrics,
  naturalness: TraceNaturalnessMetrics,
  {
    hasEffectivelyIdenticalPriorTrace = false,
  }: {
    hasEffectivelyIdenticalPriorTrace?: boolean;
  } = {},
): TraceAssessment {
  const geometryReasons = geometryFailureReasons(geometry);
  const naturalnessSignals = naturalnessSignalReasons(
    naturalness,
    hasEffectivelyIdenticalPriorTrace,
  );

  if (geometryReasons.length > 0) {
    return assessment("retry", geometryReasons, naturalnessSignals);
  }

  const hasCombinedRegularity =
    naturalness.hasHighlyUniformTiming && naturalness.hasHighlyUniformSpacing;

  if (hasEffectivelyIdenticalPriorTrace && hasCombinedRegularity) {
    return assessment("escalate", geometryReasons, naturalnessSignals);
  }

  if (hasCombinedRegularity) {
    return assessment("retry", geometryReasons, naturalnessSignals);
  }

  return assessment("pass", geometryReasons, naturalnessSignals);
}

function geometryFailureReasons(geometry: TraceGeometryMetrics): string[] {
  const reasons: string[] = [];

  if (
    geometry.meanDistanceToTarget >
    provisionalThresholds.maximumMeanDistanceToTarget
  ) {
    reasons.push("trace_offset");
  }

  if (
    geometry.maximumDistanceToTarget >
    provisionalThresholds.maximumPointDistanceToTarget
  ) {
    reasons.push("trace_deviation");
  }

  if (geometry.targetCoverage < provisionalThresholds.minimumTargetCoverage) {
    reasons.push("target_incomplete");
  }

  if (
    geometry.orderConsistency < provisionalThresholds.minimumOrderConsistency
  ) {
    reasons.push("target_reordered");
  }

  if (
    geometry.startDistanceToTarget >
      provisionalThresholds.maximumEndpointDistanceToTarget ||
    geometry.endDistanceToTarget >
      provisionalThresholds.maximumEndpointDistanceToTarget
  ) {
    reasons.push("endpoint_offset");
  }

  if (geometry.largeJumpCount > 0) {
    reasons.push("disconnected_trace");
  }

  return reasons;
}

function naturalnessSignalReasons(
  naturalness: TraceNaturalnessMetrics,
  hasEffectivelyIdenticalPriorTrace: boolean,
): string[] {
  const signals: string[] = [];

  if (naturalness.hasHighlyUniformTiming) {
    signals.push("highly_uniform_timing");
  }

  if (naturalness.hasHighlyUniformSpacing) {
    signals.push("highly_uniform_spacing");
  }

  if (hasEffectivelyIdenticalPriorTrace) {
    signals.push("repeated_trace");
  }

  return signals;
}

function assessment(
  outcome: TraceAssessmentOutcome,
  geometryReasons: string[],
  naturalnessSignals: string[],
): TraceAssessment {
  return {
    outcome,
    policyVersion: traceAcceptancePolicyVersion,
    calibrationRequired: true,
    geometryReasons,
    naturalnessSignals,
  };
}
