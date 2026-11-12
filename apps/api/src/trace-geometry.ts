import type { Point } from "@tracecaptcha/shared-types";

import type {
  NormalizedTrace,
  NormalizedTracePoint,
} from "./trace-normalization.js";

/**
 * These measurement resolutions are server-only diagnostic constants. They do
 * not accept or reject a trace; P5.4 will define policy thresholds.
 */
const coverageDistance = 0.025;
const largeJumpDistance = 0.15;

export type TraceGeometryMetrics = {
  meanDistanceToTarget: number;
  maximumDistanceToTarget: number;
  meanTargetDistance: number;
  targetCoverage: number;
  orderConsistency: number;
  startDistanceToTarget: number;
  endDistanceToTarget: number;
  maximumStepDistance: number;
  largeJumpCount: number;
};

export function calculateTraceGeometry(
  normalized: NormalizedTrace,
): TraceGeometryMetrics {
  const targetSegments = createSegments(normalized.target);
  const traceSegments = createSegments(normalized.trace);
  const traceProjections = normalized.trace.map((point) =>
    projectPointToPath(point, targetSegments),
  );
  const traceDistances = traceProjections.map(
    (projection) => projection.distance,
  );
  const targetDistances = normalized.target.map(
    (point) => projectPointToPath(point, traceSegments).distance,
  );
  const jumpMetrics = calculateJumpMetrics(
    normalized.sourceTrace,
    targetSegments,
  );
  const firstTracePoint = normalized.trace[0];
  const lastTracePoint = normalized.trace.at(-1);

  if (firstTracePoint === undefined || lastTracePoint === undefined) {
    throw new Error("Normalized trace must contain points.");
  }

  return {
    meanDistanceToTarget: average(traceDistances),
    maximumDistanceToTarget: Math.max(...traceDistances),
    meanTargetDistance: average(targetDistances),
    targetCoverage:
      targetDistances.filter((distance) => distance <= coverageDistance)
        .length / targetDistances.length,
    orderConsistency: calculateOrderConsistency(traceProjections),
    startDistanceToTarget: projectPointToPath(firstTracePoint, targetSegments)
      .distance,
    endDistanceToTarget: projectPointToPath(lastTracePoint, targetSegments)
      .distance,
    ...jumpMetrics,
  };
}

type PathSegment = {
  start: Point;
  end: Point;
  startPosition: number;
  length: number;
  totalLength: number;
};

type PathProjection = {
  distance: number;
  position: number;
};

function createSegments(points: readonly Point[]): PathSegment[] {
  const lengths = points.slice(1).map((point, index) => {
    const previous = points[index];

    if (previous === undefined) {
      throw new Error("Path points are invalid.");
    }

    return Math.hypot(point.x - previous.x, point.y - previous.y);
  });
  const totalLength = lengths.reduce((total, length) => total + length, 0);

  if (!Number.isFinite(totalLength) || totalLength <= 0) {
    throw new Error("Path must contain measurable segments.");
  }

  let startLength = 0;
  const segments: PathSegment[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = lengths[index - 1];

    if (start === undefined || end === undefined || length === undefined) {
      throw new Error("Path points are invalid.");
    }

    if (length > 0) {
      segments.push({
        start,
        end,
        startPosition: startLength / totalLength,
        length,
        totalLength,
      });
    }

    startLength += length;
  }

  if (segments.length === 0) {
    throw new Error("Path must contain measurable segments.");
  }

  return segments;
}

function projectPointToPath(
  point: Point,
  segments: readonly PathSegment[],
): PathProjection {
  let closest: PathProjection | undefined;

  for (const segment of segments) {
    const projection = projectPointToSegment(point, segment);

    if (closest === undefined || projection.distance < closest.distance) {
      closest = projection;
    }
  }

  if (closest === undefined) {
    throw new Error("Path must contain measurable segments.");
  }

  return closest;
}

function projectPointToSegment(
  point: Point,
  segment: PathSegment,
): PathProjection {
  const deltaX = segment.end.x - segment.start.x;
  const deltaY = segment.end.y - segment.start.y;
  const ratio = Math.max(
    0,
    Math.min(
      1,
      ((point.x - segment.start.x) * deltaX +
        (point.y - segment.start.y) * deltaY) /
        (segment.length * segment.length),
    ),
  );
  const projectedX = segment.start.x + ratio * deltaX;
  const projectedY = segment.start.y + ratio * deltaY;

  return {
    distance: Math.hypot(point.x - projectedX, point.y - projectedY),
    position:
      (segment.startPosition * segment.totalLength + ratio * segment.length) /
      segment.totalLength,
  };
}

function calculateOrderConsistency(
  projections: readonly PathProjection[],
): number {
  let forwardDistance = 0;
  let backwardDistance = 0;

  for (let index = 1; index < projections.length; index += 1) {
    const previous = projections[index - 1];
    const current = projections[index];

    if (previous === undefined || current === undefined) {
      throw new Error("Trace projections are invalid.");
    }

    const delta = circularDifference(current.position, previous.position);

    if (delta >= 0) {
      forwardDistance += delta;
    } else {
      backwardDistance -= delta;
    }
  }

  const totalDistance = forwardDistance + backwardDistance;
  return totalDistance === 0 ? 1 : forwardDistance / totalDistance;
}

function circularDifference(current: number, previous: number): number {
  let difference = current - previous;

  if (difference > 0.5) {
    difference -= 1;
  } else if (difference < -0.5) {
    difference += 1;
  }

  return difference;
}

function calculateJumpMetrics(
  sourceTrace: readonly NormalizedTracePoint[],
  targetSegments: readonly PathSegment[],
): Pick<TraceGeometryMetrics, "maximumStepDistance" | "largeJumpCount"> {
  let maximumStepDistance = 0;
  let largeJumpCount = 0;

  for (let index = 1; index < sourceTrace.length; index += 1) {
    const previous = sourceTrace[index - 1];
    const current = sourceTrace[index];

    if (previous === undefined || current === undefined) {
      throw new Error("Normalized trace points are invalid.");
    }

    const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
    maximumStepDistance = Math.max(maximumStepDistance, distance);

    const midpoint = {
      x: (previous.x + current.x) / 2,
      y: (previous.y + current.y) / 2,
    };

    if (
      distance > largeJumpDistance &&
      projectPointToPath(midpoint, targetSegments).distance > coverageDistance
    ) {
      largeJumpCount += 1;
    }
  }

  return { maximumStepDistance, largeJumpCount };
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Metric values must not be empty.");
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}
