import type {
  ChallengeId,
  ChallengeRenderData,
  ChallengeResponse,
  ChallengeType,
  Point,
  ProtectedAction,
} from "@tracecaptcha/shared-types";

export type ChallengeDifficulty = "low" | "standard" | "high";

export type ChallengeStatus = "active" | "consumed" | "expired";

export type CanonicalPolygonTarget = {
  type: "polygon";
  normalizedPath: Point[];
};

export type CanonicalChallengeTarget = CanonicalPolygonTarget;

export type ChallengeState = {
  id: ChallengeId;
  customerId: string;
  siteId: string;
  action: ProtectedAction;
  sessionId?: string;
  type: ChallengeType;
  difficulty: ChallengeDifficulty;
  seed: string;
  canonicalTarget: CanonicalChallengeTarget;
  renderData: ChallengeRenderData;
  createdAt: string;
  expiresAt: string;
  status: ChallengeStatus;
};

export function toChallengeResponse(
  challenge: ChallengeState,
): ChallengeResponse {
  return {
    challengeId: challenge.id,
    action: challenge.action,
    renderData: challenge.renderData,
    expiresAt: challenge.expiresAt,
  };
}
