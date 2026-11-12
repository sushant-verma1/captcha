export const decisionTypes = [
  "allow",
  "challenge",
  "retry",
  "cooldown",
  "block",
] as const;

export type DecisionType = (typeof decisionTypes)[number];

export type ProtectedAction = string;

export const initialProtectedActions = [
  "signup",
  "login",
  "password_reset",
  "otp_request",
] as const;

export type InitialProtectedAction = (typeof initialProtectedActions)[number];

export type RiskBand = "low" | "elevated" | "high" | "severe";

export type PolicyDecision = Exclude<DecisionType, "retry">;

export type PolicyVersionStatus = "active" | "superseded";

export type SiteActionPolicyDecisions = {
  lowRiskDecision: PolicyDecision;
  elevatedRiskDecision: PolicyDecision;
  highRiskDecision: PolicyDecision;
  severeRiskDecision: PolicyDecision;
};

export type SiteActionPolicy = SiteActionPolicyDecisions & {
  id: string;
  siteId: string;
  action: InitialProtectedAction;
  version: number;
  status: PolicyVersionStatus;
  createdAt: string;
  supersededAt?: string;
};

export type CustomerStatus = "active" | "suspended";
export type SiteIdentifierKind =
  "web_hostname" | "android_package" | "ios_bundle";

export type Customer = {
  id: string;
  name: string;
  status: CustomerStatus;
  createdAt: string;
};

export type CustomerEnvironment = {
  id: string;
  customerId: string;
  name: string;
  status: CustomerStatus;
  createdAt: string;
};

export type Site = {
  id: string;
  customerId: string;
  environmentId: string;
  name: string;
  status: CustomerStatus;
  createdAt: string;
};

export type SiteIdentifier = {
  siteId: string;
  kind: SiteIdentifierKind;
  value: string;
  createdAt: string;
};

export type SiteCredentialKind =
  "public_site_key" | "private_server_credential";

export type SiteCredentialStatus = "active" | "retiring" | "revoked";

export type SiteCredentialMetadata = {
  id: string;
  siteId: string;
  kind: SiteCredentialKind;
  keyId: string;
  label?: string;
  status: SiteCredentialStatus;
  createdAt: string;
  retiredAt?: string;
  notAfter?: string;
  revokedAt?: string;
};

export type DecisionRequest = {
  action: ProtectedAction;
  sessionId?: string;
  context?: {
    attemptId?: string;
  };
};

export type DecisionResponse = {
  decisionId: string;
  decision: DecisionType;
  reasonCategory?: string;
  expiresAt?: string;
};

export type CreateChallengeRequest = {
  action: ProtectedAction;
  sessionId?: string;
  decisionId?: string;
};

export type Point = {
  x: number;
  y: number;
};

export type ChallengeId = string;
export type ChallengeType = "polygon";

export type ChallengeRenderData = {
  version: number;
  canvas: {
    width: number;
    height: number;
  };
  target: {
    kind: ChallengeType;
    displayPath: Point[];
  };
};

export type ChallengeResponse = {
  challengeId: ChallengeId;
  action: ProtectedAction;
  renderData: ChallengeRenderData;
  expiresAt: string;
};

export type TracePoint = {
  x: number;
  y: number;
  t: number;
};

export type VerifyChallengeRequest = {
  action: ProtectedAction;
  trace: TracePoint[];
};

export type VerificationResponse = {
  decision: DecisionType;
  verificationToken?: string;
  expiresAt?: string;
  reasonCategory?: string;
};

export type VerifyTokenRequest = {
  token: string;
  expectedAction: ProtectedAction;
  consume?: boolean;
};

export type TokenVerificationResponse = {
  valid: boolean;
  action?: ProtectedAction;
  expiresAt?: string;
};

export type ErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};
