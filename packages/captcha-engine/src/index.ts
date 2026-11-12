export const challengeRenderVersion = 1;

export type CanvasSize = {
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type ChallengeKind = "polygon";

export type PolygonChallengeGeometry = {
  normalizedPath: Point[];
  displayPath: Point[];
};

const minimumCanvasDimension = 120;
const maximumCanvasDimension = 1_024;

export function generatePolygonGeometry(
  seed: string,
  canvas: CanvasSize,
): PolygonChallengeGeometry {
  assertSupportedCanvas(canvas);

  if (seed.length === 0) {
    throw new Error("Challenge seed must not be empty.");
  }

  const random = seededRandom(seed);
  const sides = 4 + Math.floor(random() * 3);
  const minimumDimension = Math.min(canvas.width, canvas.height);
  const radius = minimumDimension * between(random, 0.22, 0.28);
  const margin = minimumDimension * 0.08;
  const centerX = between(
    random,
    radius + margin,
    canvas.width - radius - margin,
  );
  const centerY = between(
    random,
    radius + margin,
    canvas.height - radius - margin,
  );
  const rotation = random() * Math.PI * 2;
  const displayPath: Point[] = [];
  const normalizedPath: Point[] = [];

  for (let index = 0; index < sides; index += 1) {
    const angle = rotation + (index * Math.PI * 2) / sides;
    const x = round(centerX + radius * Math.cos(angle));
    const y = round(centerY + radius * Math.sin(angle));

    displayPath.push({ x, y });
    normalizedPath.push({
      x: round(x / canvas.width),
      y: round(y / canvas.height),
    });
  }

  return { normalizedPath, displayPath };
}

function assertSupportedCanvas(canvas: CanvasSize): void {
  if (
    !Number.isInteger(canvas.width) ||
    !Number.isInteger(canvas.height) ||
    canvas.width < minimumCanvasDimension ||
    canvas.width > maximumCanvasDimension ||
    canvas.height < minimumCanvasDimension ||
    canvas.height > maximumCanvasDimension
  ) {
    throw new RangeError("Canvas dimensions are outside the supported bounds.");
  }
}

function seededRandom(seed: string): () => number {
  let state = 2_166_136_261;

  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16_777_619);
  }

  return () => {
    state += 1_836_903_533;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function between(
  random: () => number,
  minimum: number,
  maximum: number,
): number {
  return minimum + random() * (maximum - minimum);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
