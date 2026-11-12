import assert from "node:assert/strict";
import test from "node:test";

import {
  createChallengeSeed,
  generatePolygonChallenge,
} from "./challenge-generator.js";

test("creates cryptographically sized, distinct challenge seeds", () => {
  const firstSeed = createChallengeSeed();
  const secondSeed = createChallengeSeed();

  assert.equal(Buffer.from(firstSeed, "base64url").length, 32);
  assert.equal(Buffer.from(secondSeed, "base64url").length, 32);
  assert.notEqual(firstSeed, secondSeed);
});

test("generates deterministic bounded polygon render data from a seed", () => {
  const canvas = { width: 320, height: 220 };
  const generated = generatePolygonChallenge("test-seed", canvas);

  assert.deepEqual(generated, generatePolygonChallenge("test-seed", canvas));
  assert.notDeepEqual(
    generated,
    generatePolygonChallenge("other-seed", canvas),
  );
  assert.ok(generated.renderData.target.displayPath.length >= 4);
  assert.ok(generated.renderData.target.displayPath.length <= 6);

  for (const point of generated.renderData.target.displayPath) {
    assert.ok(point.x >= 0 && point.x <= canvas.width);
    assert.ok(point.y >= 0 && point.y <= canvas.height);
  }

  for (const point of generated.canonicalTarget.normalizedPath) {
    assert.ok(point.x >= 0 && point.x <= 1);
    assert.ok(point.y >= 0 && point.y <= 1);
  }
});

test("keeps polygons within every supported canvas boundary", () => {
  for (const canvas of [
    { width: 120, height: 120 },
    { width: 1_024, height: 120 },
    { width: 120, height: 1_024 },
    { width: 1_024, height: 1_024 },
  ]) {
    const generated = generatePolygonChallenge("boundary-seed", canvas);

    for (const point of generated.renderData.target.displayPath) {
      assert.ok(point.x >= 0 && point.x <= canvas.width);
      assert.ok(point.y >= 0 && point.y <= canvas.height);
    }
  }
});
