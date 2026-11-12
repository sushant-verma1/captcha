import type { Point, TracePoint } from "@tracecaptcha/shared-types";

import type { CanonicalChallengeTarget } from "./challenge-state.js";

export const minimumTracePoints = 2;
export const maximumTracePoints = 2_000;
export const maximumTraceDurationMs = 120_000;
export const normalizedTracePointCount = 128;

export type NormalizedTracePoint = TracePoint;

export type NormalizedTrace = {
  sourceTrace: NormalizedTracePoint[];
  trace: NormalizedTracePoint[];
  target: Point[];
  durationMs: number;
};

export class TraceValidationError extends Error {
  public constructor() {
    super("The trace is invalid.");
    this.name = "TraceValidationError";
  }
}

/**
 * Validates browser-provided points against the server-issued canvas, removes
 * no-op movement, converts coordinates to the canonical unit square, and
 * bounds later validator work with deterministic arc-length resampling.
 */
export function normalizeTrace(
  input: unknown,
  challenge: {
    canvas: { width: number; height: number };
    canonicalTarget: CanonicalChallengeTarget;
  },
): NormalizedTrace {
  assertTrustedChallenge(challenge);

  if (
    !Array.isArray(input) ||
    input.length < minimumTracePoints ||
    input.length > maximumTracePoints
  ) {
    throw new TraceValidationError();
  }

  const normalizedPoints: NormalizedTracePoint[] = [];
  let previousTimestamp = -1;

  for (const [index, value] of input.entries()) {
    const point = parseTracePoint(value, challenge.canvas, index);

    if (point.t < previousTimestamp || (index === 0 && point.t !== 0)) {
      throw new TraceValidationError();
    }

    previousTimestamp = point.t;

    const normalizedPoint = {
      x: point.x / challenge.canvas.width,
      y: point.y / challenge.canvas.height,
      t: point.t,
    };
    const previousPoint = normalizedPoints.at(-1);

    if (
      previousPoint === undefined ||
      previousPoint.x !== normalizedPoint.x ||
      previousPoint.y !== normalizedPoint.y
    ) {
      normalizedPoints.push(normalizedPoint);
    }
  }

  if (normalizedPoints.length < minimumTracePoints) {
    throw new TraceValidationError();
  }

  const target = closeTargetPath(challenge.canonicalTarget.normalizedPath);

  return {
    sourceTrace: normalizedPoints,
    trace: resampleTrace(normalizedPoints, normalizedTracePointCount),
    target: resamplePath(target, normalizedTracePointCount),
    durationMs: previousTimestamp,
  };
}

function parseTracePoint(
  value: unknown,
  canvas: { width: number; height: number },
  index: number,
): TracePoint {
  if (!isExactTracePoint(value)) {
    throw new TraceValidationError();
  }

  const { x, y, t } = value;

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isInteger(t) ||
    x < 0 ||
    x > canvas.width ||
    y < 0 ||
    y > canvas.height ||
    t < 0 ||
    t > maximumTraceDurationMs ||
    (index === 0 && t !== 0)
  ) {
    throw new TraceValidationError();
  }

  return { x, y, t };
}

function isExactTracePoint(
  value: unknown,
): value is { x: number; y: number; t: number } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);

  if (
    keys.length !== 3 ||
    !keys.every((key) => key === "x" || key === "y" || key === "t")
  ) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.x === "number" &&
    typeof record.y === "number" &&
    typeof record.t === "number"
  );
}

function assertTrustedChallenge(challenge: {
  canvas: { width: number; height: number };
  canonicalTarget: CanonicalChallengeTarget;
}): void {
  const { width, height } = challenge.canvas;

  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 120 ||
    width > 1_024 ||
    height < 120 ||
    height > 1_024
  ) {
    throw new Error("The stored challenge has invalid canvas dimensions.");
  }

  if (
    challenge.canonicalTarget.type !== "polygon" ||
    challenge.canonicalTarget.normalizedPath.length < 3 ||
    challenge.canonicalTarget.normalizedPath.some(
      (point) =>
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < 0 ||
        point.x > 1 ||
        point.y < 0 ||
        point.y > 1,
    )
  ) {
    throw new Error("The stored challenge has an invalid canonical target.");
  }
}

function closeTargetPath(path: readonly Point[]): Point[] {
  const first = path[0];
  const last = path.at(-1);

  if (first === undefined || last === undefined) {
    throw new Error("The stored challenge has an empty canonical target.");
  }

  return last.x === first.x && last.y === first.y
    ? [...path]
    : [...path, { ...first }];
}

function resampleTrace(
  points: readonly NormalizedTracePoint[],
  count: number,
): NormalizedTracePoint[] {
  const distances = cumulativeDistances(points);
  const totalDistance = distances.at(-1);

  if (totalDistance === undefined || totalDistance <= 0) {
    throw new TraceValidationError();
  }

  return Array.from({ length: count }, (_, index) => {
    const distance = (totalDistance * index) / (count - 1);
    const { start, end, ratio } = segmentAtDistance(
      points,
      distances,
      distance,
    );

    return {
      x: interpolate(start.x, end.x, ratio),
      y: interpolate(start.y, end.y, ratio),
      t: Math.round(interpolate(start.t, end.t, ratio)),
    };
  });
}

function resamplePath(points: readonly Point[], count: number): Point[] {
  const distances = cumulativeDistances(points);
  const totalDistance = distances.at(-1);

  if (totalDistance === undefined || totalDistance <= 0) {
    throw new Error("The stored challenge has a degenerate canonical target.");
  }

  return Array.from({ length: count }, (_, index) => {
    const distance = (totalDistance * index) / (count - 1);
    const { start, end, ratio } = segmentAtDistance(
      points,
      distances,
      distance,
    );

    return {
      x: interpolate(start.x, end.x, ratio),
      y: interpolate(start.y, end.y, ratio),
    };
  });
}

function cumulativeDistances(points: readonly Point[]): number[] {
  const distances = [0];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const previousDistance = distances[index - 1];

    if (
      previous === undefined ||
      current === undefined ||
      previousDistance === undefined
    ) {
      throw new Error("Path points are invalid.");
    }

    distances.push(
      previousDistance +
        Math.hypot(current.x - previous.x, current.y - previous.y),
    );
  }

  return distances;
}

function segmentAtDistance<T extends Point>(
  points: readonly T[],
  distances: readonly number[],
  distance: number,
): { start: T; end: T; ratio: number } {
  let segmentIndex = distances.length - 1;

  for (let index = 1; index < distances.length; index += 1) {
    const segmentEnd = distances[index];

    if (segmentEnd !== undefined && distance <= segmentEnd) {
      segmentIndex = index;
      break;
    }
  }

  const start = points[segmentIndex - 1];
  const end = points[segmentIndex];
  const startDistance = distances[segmentIndex - 1];
  const endDistance = distances[segmentIndex];

  if (
    start === undefined ||
    end === undefined ||
    startDistance === undefined ||
    endDistance === undefined ||
    endDistance <= startDistance
  ) {
    throw new Error("Path segments are invalid.");
  }

  return {
    start,
    end,
    ratio: (distance - startDistance) / (endDistance - startDistance),
  };
}

function interpolate(start: number, end: number, ratio: number): number {
  return start + (end - start) * ratio;
}
