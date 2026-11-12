import { randomBytes } from "node:crypto";

import {
  challengeRenderVersion,
  generatePolygonGeometry,
  type CanvasSize,
} from "@tracecaptcha/captcha-engine";

import type { ChallengeRenderData } from "@tracecaptcha/shared-types";

import type { CanonicalPolygonTarget } from "./challenge-state.js";

export type GeneratedPolygonChallenge = {
  type: "polygon";
  seed: string;
  canonicalTarget: CanonicalPolygonTarget;
  renderData: ChallengeRenderData;
};

export const defaultChallengeCanvas: CanvasSize = {
  width: 320,
  height: 220,
};

export function createChallengeSeed(): string {
  return randomBytes(32).toString("base64url");
}

export function generatePolygonChallenge(
  seed: string,
  canvas: CanvasSize = defaultChallengeCanvas,
): GeneratedPolygonChallenge {
  const geometry = generatePolygonGeometry(seed, canvas);

  return {
    type: "polygon",
    seed,
    canonicalTarget: {
      type: "polygon",
      normalizedPath: geometry.normalizedPath,
    },
    renderData: {
      version: challengeRenderVersion,
      canvas,
      target: {
        kind: "polygon",
        displayPath: geometry.displayPath,
      },
    },
  };
}
