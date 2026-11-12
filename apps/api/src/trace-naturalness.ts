import type {
  NormalizedTrace,
  NormalizedTracePoint,
} from "./trace-normalization.js";

const uniformityCoefficientThreshold = 0.05;
const minimumUniformitySamples = 8;
const coordinateIdentityTolerance = 0.0001;
const timestampIdentityToleranceMs = 1;

export type TraceNaturalnessMetrics = {
  durationMs: number;
  medianInterEventIntervalMs: number;
  maximumInterEventIntervalMs: number;
  longestPauseShare: number;
  timingIntervalCoefficientOfVariation: number;
  pointSpacingCoefficientOfVariation: number;
  hasHighlyUniformTiming: boolean;
  hasHighlyUniformSpacing: boolean;
};

/**
 * Produces timing and movement-regularity diagnostics independently from
 * geometry. The returned data contains summaries only, never raw points.
 */
export function calculateTraceNaturalness(
  normalized: NormalizedTrace,
): TraceNaturalnessMetrics {
  const intervals = interEventIntervals(normalized);
  const spacings = pointSpacings(normalized.sourceTrace);
  const timingIntervalCoefficientOfVariation =
    coefficientOfVariation(intervals);
  const pointSpacingCoefficientOfVariation = coefficientOfVariation(spacings);

  return {
    durationMs: normalized.durationMs,
    medianInterEventIntervalMs: median(intervals),
    maximumInterEventIntervalMs: Math.max(...intervals),
    longestPauseShare:
      normalized.durationMs === 0
        ? 0
        : Math.max(...intervals) / normalized.durationMs,
    timingIntervalCoefficientOfVariation,
    pointSpacingCoefficientOfVariation,
    hasHighlyUniformTiming:
      intervals.length >= minimumUniformitySamples &&
      timingIntervalCoefficientOfVariation <= uniformityCoefficientThreshold,
    hasHighlyUniformSpacing:
      spacings.length >= minimumUniformitySamples &&
      pointSpacingCoefficientOfVariation <= uniformityCoefficientThreshold,
  };
}

/**
 * Compares only traces already available to the current caller. It creates no
 * fingerprint and stores no behavioral data; future request-level policy must
 * supply and bound any prior traces before this helper is used.
 */
export function hasEffectivelyIdenticalTrace(
  trace: NormalizedTrace,
  priorTraces: readonly NormalizedTrace[],
): boolean {
  return priorTraces.some((priorTrace) =>
    pointsAreEffectivelyIdentical(trace.sourceTrace, priorTrace.sourceTrace),
  );
}

function interEventIntervals(normalized: NormalizedTrace): number[] {
  const intervals: number[] = [];

  for (let index = 1; index < normalized.sourceTrace.length; index += 1) {
    const previous = normalized.sourceTrace[index - 1];
    const current = normalized.sourceTrace[index];

    if (previous === undefined || current === undefined) {
      throw new Error("Normalized trace points are invalid.");
    }

    intervals.push(current.t - previous.t);
  }

  const lastPoint = normalized.sourceTrace.at(-1);

  if (lastPoint === undefined || normalized.durationMs < lastPoint.t) {
    throw new Error("Normalized trace duration is invalid.");
  }

  if (normalized.durationMs > lastPoint.t) {
    intervals.push(normalized.durationMs - lastPoint.t);
  }

  return intervals;
}

function pointSpacings(points: readonly NormalizedTracePoint[]): number[] {
  const spacings: number[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];

    if (previous === undefined || current === undefined) {
      throw new Error("Normalized trace points are invalid.");
    }

    spacings.push(Math.hypot(current.x - previous.x, current.y - previous.y));
  }

  return spacings;
}

function coefficientOfVariation(values: readonly number[]): number {
  const mean = average(values);

  if (mean === 0) {
    return 0;
  }

  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) /
    values.length;
  return Math.sqrt(variance) / mean;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Metric values must not be empty.");
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const lower = sorted[middle - 1];
  const upper = sorted[middle];

  if (upper === undefined) {
    throw new Error("Metric values must not be empty.");
  }

  return sorted.length % 2 === 0
    ? ((lower === undefined ? upper : lower) + upper) / 2
    : upper;
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Metric values must not be empty.");
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function pointsAreEffectivelyIdentical(
  trace: readonly NormalizedTracePoint[],
  priorTrace: readonly NormalizedTracePoint[],
): boolean {
  if (trace.length !== priorTrace.length) {
    return false;
  }

  return trace.every((point, index) => {
    const priorPoint = priorTrace[index];

    return (
      priorPoint !== undefined &&
      Math.abs(point.x - priorPoint.x) <= coordinateIdentityTolerance &&
      Math.abs(point.y - priorPoint.y) <= coordinateIdentityTolerance &&
      Math.abs(point.t - priorPoint.t) <= timestampIdentityToleranceMs
    );
  });
}
