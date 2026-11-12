import type {
  InitialProtectedAction,
  SiteActionPolicyDecisions,
} from "@tracecaptcha/shared-types";

export const initialActionPolicyDefaults = {
  signup: {
    lowRiskDecision: "allow",
    elevatedRiskDecision: "challenge",
    highRiskDecision: "cooldown",
    severeRiskDecision: "block",
  },
  login: {
    lowRiskDecision: "allow",
    elevatedRiskDecision: "challenge",
    highRiskDecision: "cooldown",
    severeRiskDecision: "block",
  },
  password_reset: {
    lowRiskDecision: "challenge",
    elevatedRiskDecision: "challenge",
    highRiskDecision: "cooldown",
    severeRiskDecision: "block",
  },
  otp_request: {
    lowRiskDecision: "challenge",
    elevatedRiskDecision: "challenge",
    highRiskDecision: "cooldown",
    severeRiskDecision: "block",
  },
} as const satisfies Readonly<
  Record<InitialProtectedAction, SiteActionPolicyDecisions>
>;
