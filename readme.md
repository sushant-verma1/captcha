# TraceCAPTCHA

TraceCAPTCHA is an adaptive drawing-based CAPTCHA platform for websites and applications.

It combines:

1. A drawing CAPTCHA that users complete by tracing a generated shape.
2. A risk-based wrapper that decides whether a protected action needs a challenge.

Customers do not need to write their own rules for when to show CAPTCHA. They identify an action such as signup or password reset, and TraceCAPTCHA returns an appropriate decision.

## How it works

```text
Customer action
      ↓
TraceCAPTCHA evaluates risk
      ↓
Low risk ───────────────→ allow
Elevated risk ──────────→ show drawing CAPTCHA
Repeated failures ──────→ retry, cooldown, or block
      ↓
Server verifies the result
      ↓
Short-lived verification token
```

The browser is not trusted to calculate or declare the final result. TraceCAPTCHA validates the trace on the server and issues a token that the customer backend can verify before completing the protected action.

## Typical protected actions

- account signup
- login attempts
- password reset
- OTP or email-code requests
- sensitive form submissions
- checkout or account changes

Each action can have a different risk policy.

## Integration concept

The customer installs the browser SDK and identifies the action being protected:

```ts
const decision = await traceCaptcha.protect({
  action: "signup",
});

if (decision.type === "challenge") {
  // The SDK renders the TraceCAPTCHA drawing challenge.
}
```

When a server-verified token is available, the customer sends it to its backend. The backend verifies and consumes the token with TraceCAPTCHA before accepting the action. Browser callbacks and visible widget state are never authorization evidence.

## Decisions

TraceCAPTCHA may return:

- `allow` — no challenge is required
- `challenge` — display the drawing CAPTCHA
- `retry` — request a fresh attempt
- `cooldown` — temporarily slow or stop attempts
- `block` — reject the action according to policy

These decisions are risk outcomes, not guarantees about whether a visitor is human.

## Security model

- challenge state is created and validated server-side
- target paths and authoritative scoring remain private
- challenges expire and are single-use
- verification tokens are short-lived and action-bound
- customer servers verify tokens before completing protected actions
- challenge, decision, and verification endpoints are rate-limited

## Privacy and accessibility

TraceCAPTCHA should collect only the behavioral signals needed for a configured decision. It should not collect passwords, raw typed content, or unnecessary page data. Customers should disclose the relevant collection and configure retention appropriately for their users and regions.

A drawing-only flow is not suitable for every user. Production integrations should provide an accessible alternative or a customer-controlled fallback path.

## Current scope

The initial implementation focuses on:

- one reliable drawing challenge family
- mouse, touch, and stylus input
- server-side trace validation
- short-lived verification tokens
- deterministic risk rules
- a framework-neutral browser integration
- a Shadow-DOM Web Component and optional React adapter

Machine learning, multiple challenge families, and advanced analytics are intentionally deferred until the basic system has measurable outcomes.

Challenge verification now validates bounded traces on the server and can return short-lived action-bound tokens. A browser event, local trace, or returned token is never authorization by itself: the customer backend must verify and atomically consume every token before completing a protected action. Trace-acceptance thresholds remain provisional and require calibration before production rollout; accessible customer-controlled recovery remains required.

## Documentation

- [`docs/server-token-verification.md`](docs/server-token-verification.md) — private backend token-verification flow and copyable Node/TypeScript helper
- [`docs/browser-sdk-integration.md`](docs/browser-sdk-integration.md) — framework-neutral Web Component and React integration, decision states, and safe recovery behavior
- [`docs/release-readiness.md`](docs/release-readiness.md) — browser support target, known limits, and MVP release gate
- `project.md` — original product specification
- `plan.md` — delivery phases and success criteria
- `architecture.md` — system boundaries and data flows
- `techstack.md` — technology choices and rationale
- `agent.md` — rules for coding agents
- `notes.md` — internal project decision and work log

## Status

The API contract, decision client, Web Component, React adapter, server-side challenge verification, and server token-consumption boundary are implemented. Human browser/accessibility release-gate testing and trace-policy calibration remain incomplete. No project service is started by reading these documents.
