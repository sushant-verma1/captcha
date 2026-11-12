import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
} from "react";

import type {
  DecisionResponse,
  ProtectedAction,
  VerificationResponse,
} from "@tracecaptcha/shared-types";

import {
  defineTraceCaptchaElement,
  TraceCaptchaClientError,
  traceCaptchaElementName,
  type TraceCaptchaElement,
  type TraceCaptchaElementState,
  type TraceCaptchaElementStateChange,
} from "./index.js";

export type TraceCaptchaReactProps = {
  siteKey: string;
  endpoint: string;
  action: ProtectedAction;
  sessionId?: string;
  className?: string;
  id?: string;
  style?: CSSProperties;
  /**
   * Receives sanitized browser UI state only. It is not a verification result
   * and must never authorize a protected action.
   */
  onStateChange?: (change: TraceCaptchaElementStateChange) => void;
};

export type TraceCaptchaReactHandle = {
  /** Starts a fresh policy-decision flow through the underlying element. */
  protect(): Promise<DecisionResponse>;
  /** Permanently releases the underlying element's client and renderer. */
  destroy(): void;
};

/**
 * A React view of the framework-neutral <trace-captcha> element. It contains
 * no risk, challenge, trace-scoring, or protected-action authorization logic.
 */
export const TraceCaptcha = forwardRef<
  TraceCaptchaReactHandle,
  TraceCaptchaReactProps
>(function TraceCaptcha(
  { siteKey, endpoint, action, sessionId, className, id, style, onStateChange },
  ref,
) {
  const elementRef = useRef<TraceCaptchaElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      protect: () => {
        const element = elementRef.current;
        if (element === null) {
          return Promise.reject(new TraceCaptchaClientError("configuration"));
        }

        return element.protect();
      },
      destroy: () => elementRef.current?.destroy(),
    }),
    [],
  );

  useEffect(() => {
    defineTraceCaptchaElement();
    const element = elementRef.current;
    if (element === null || onStateChange === undefined) {
      return;
    }

    const onElementStateChange = (event: Event): void => {
      const change = toTraceCaptchaElementStateChange(event);
      if (change !== undefined) {
        onStateChange(change);
      }
    };

    element.addEventListener("tracecaptcha-statechange", onElementStateChange);
    return () => {
      element.removeEventListener(
        "tracecaptcha-statechange",
        onElementStateChange,
      );
    };
  }, [onStateChange]);

  return createElement(traceCaptchaElementName, {
    ref: elementRef,
    "site-key": siteKey,
    endpoint,
    action,
    ...(sessionId === undefined ? {} : { "session-id": sessionId }),
    ...(className === undefined ? {} : { className }),
    ...(id === undefined ? {} : { id }),
    ...(style === undefined ? {} : { style }),
  });
});

function toTraceCaptchaElementStateChange(
  event: Event,
): TraceCaptchaElementStateChange | undefined {
  if (
    event.type !== "tracecaptcha-statechange" ||
    !(event instanceof CustomEvent) ||
    !isRecord(event.detail) ||
    !isTraceCaptchaElementState(event.detail.state)
  ) {
    return undefined;
  }

  const decision = isDecisionResponse(event.detail.decision)
    ? event.detail.decision
    : undefined;
  const challenge = isPublicChallenge(event.detail.challenge)
    ? event.detail.challenge
    : undefined;
  const verification = isVerificationResponse(event.detail.verification)
    ? event.detail.verification
    : undefined;

  return {
    state: event.detail.state,
    ...(decision === undefined ? {} : { decision }),
    ...(challenge === undefined ? {} : { challenge }),
    ...(verification === undefined ? {} : { verification }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isTraceCaptchaElementState(
  value: unknown,
): value is TraceCaptchaElementState {
  return (
    value === "idle" ||
    value === "requesting" ||
    value === "allow" ||
    value === "challenge" ||
    value === "retry" ||
    value === "cooldown" ||
    value === "block" ||
    value === "unavailable" ||
    value === "destroyed" ||
    value === "loading" ||
    value === "drawing" ||
    value === "submitting" ||
    value === "success" ||
    value === "rejected" ||
    value === "expired" ||
    value === "consumed" ||
    value === "verification_disabled" ||
    value === "fallback"
  );
}

function isDecisionResponse(value: unknown): value is DecisionResponse {
  return (
    isRecord(value) &&
    typeof value.decisionId === "string" &&
    value.decisionId.trim().length > 0 &&
    (value.decision === "allow" ||
      value.decision === "challenge" ||
      value.decision === "retry" ||
      value.decision === "cooldown" ||
      value.decision === "block")
  );
}

function isPublicChallenge(
  value: unknown,
): value is TraceCaptchaElementStateChange["challenge"] {
  return (
    isRecord(value) &&
    typeof value.challengeId === "string" &&
    value.challengeId.trim().length > 0 &&
    typeof value.action === "string" &&
    value.action.trim().length > 0 &&
    typeof value.expiresAt === "string" &&
    Number.isFinite(Date.parse(value.expiresAt))
  );
}

function isVerificationResponse(value: unknown): value is VerificationResponse {
  return (
    isRecord(value) &&
    (value.decision === "allow" ||
      value.decision === "challenge" ||
      value.decision === "retry" ||
      value.decision === "cooldown" ||
      value.decision === "block") &&
    (value.verificationToken === undefined ||
      (typeof value.verificationToken === "string" &&
        value.verificationToken.trim().length > 0)) &&
    (value.expiresAt === undefined ||
      (typeof value.expiresAt === "string" &&
        Number.isFinite(Date.parse(value.expiresAt)))) &&
    (value.reasonCategory === undefined ||
      typeof value.reasonCategory === "string")
  );
}
