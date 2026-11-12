# Browser SDK integration

Use the public site key in browser code only to request TraceCAPTCHA decisions
and public challenge render data. It is not a secret and cannot verify a token,
administer TraceCAPTCHA, or authorize a protected action. Never expose a
`tc_server` key in browser code, client-visible configuration, or browser logs.

The browser component reports user-interface state, not proof that an action is
safe to complete. Your backend remains responsible for the protected action and
must consume a verification token server-to-server when a verified token is
available.

## Verification boundary

`POST /v1/challenges/{challengeId}/verify` validates a bounded trace against
the server-held challenge, consumes that challenge once, and can return a
short-lived token. The component submits a trace only for its active public
challenge and reports `success` only after receiving an `allow` response with a
token. That event and token are still untrusted browser input: forward the
token to your backend and complete the protected action only after the backend
atomically verifies and consumes it with TraceCAPTCHA.

## Current browser data boundary

For a decision request, the SDK sends the public site key, protected action, and
optional customer-provided session reference. If the public decision is
`challenge`, it additionally sends the public decision ID when requesting the
owned challenge. It never sends a private server key, score, rule ID, canonical
target, password, page content, or keystrokes.

For an active challenge, the component sends only its server-issued challenge
ID (in the URL), action, and bounded canvas-relative trace points to the
verification endpoint. It never sends a private server key, score, rule ID,
canonical target, password, page content, or keystrokes. Raw traces are used
only for the current verification request and are not persisted by this API.
Customer applications remain responsible for their own notices, retention, and
accessible recovery flow.

## Retrying challenge creation

Direct callers of `POST /v1/challenges` may send an optional `Idempotency-Key`
header (1–255 characters) when a network failure makes the creation result
ambiguous. Reuse the key only with the same action, optional session reference,
and optional decision ID. A matching retry returns the original `201` challenge
response without creating another challenge; changing those inputs returns
`409 idempotency_conflict`. A concurrent matching request can return
`409 idempotency_in_progress`; retry it shortly with the same key. This header
does not authorize a browser action or change the current verification boundary.

## Framework-neutral Web Component

Register the component once, configure it with the public site key and the
protected action, then listen for state changes before attaching it to the page.

```ts
import {
  defineTraceCaptchaElement,
  type TraceCaptchaElement,
  type TraceCaptchaElementStateChange,
} from "@tracecaptcha/browser-sdk";

defineTraceCaptchaElement();

const widget = document.createElement("trace-captcha") as TraceCaptchaElement;
widget.siteKey = "tc_site_public_key";
widget.endpoint = "https://captcha.example.com";
widget.action = "signup";
widget.sessionId = "signup-session-reference"; // Optional, non-secret reference.

widget.addEventListener("tracecaptcha-statechange", (event: Event) => {
  const { state, verification } = (
    event as CustomEvent<TraceCaptchaElementStateChange>
  ).detail;

  switch (state) {
    case "allow":
      // Update UI under your application policy. This browser event is not
      // server-side authorization evidence.
      break;
    case "drawing":
      // A fresh owned drawing challenge is visible.
      break;
    case "success":
      // Send this browser-supplied token to your backend. The backend must
      // verify and consume it before completing signup.
      void sendTokenToBackend(verification?.verificationToken);
      break;
    case "retry":
    case "fallback":
      // Present your accessible, customer-controlled recovery path.
      break;
    case "unavailable":
      // Offer a retry or follow your explicitly chosen outage policy.
      break;
  }
});

document.querySelector("#captcha-slot")?.append(widget);
```

The element requests a new decision when connected or when its configuration
attributes change. Call `widget.protect()` only when your application needs a
fresh decision; it does not bypass the decision flow to create a challenge.

Equivalent markup uses `site-key`, `endpoint`, `action`, and optional
`session-id` attributes:

```html
<trace-captcha
  site-key="tc_site_public_key"
  endpoint="https://captcha.example.com"
  action="signup"
  session-id="signup-session-reference"
></trace-captcha>
```

## React

Import the optional React entry point. It renders the same Web Component and
does not duplicate risk, challenge, or verification behavior.

```tsx
import { useRef } from "react";
import {
  TraceCaptcha,
  type TraceCaptchaReactHandle,
} from "@tracecaptcha/browser-sdk/react";

export function SignupCaptcha() {
  const captcha = useRef<TraceCaptchaReactHandle>(null);

  return (
    <TraceCaptcha
      ref={captcha}
      siteKey="tc_site_public_key"
      endpoint="https://captcha.example.com"
      action="signup"
      sessionId="signup-session-reference"
      onStateChange={({ state, verification }) => {
        if (state === "success") {
          // Send the untrusted browser token to the backend for consuming
          // verification. Do not submit signup from this callback alone.
          void sendTokenToBackend(verification?.verificationToken);
        }
        if (state === "fallback") {
          // Show the application's accessible fallback; do not submit signup.
        }
      }}
    />
  );
}
```

The optional `captcha.current?.protect()` method requests a fresh decision. Its
returned decision and every callback are browser-controlled UI data, not a
credential for a backend request.

## Decision and recovery states

| State                                         | Customer integration behavior                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `requesting`, `loading`                       | Keep the protected UI pending.                                                                   |
| `allow`                                       | Apply your application policy; do not treat the browser event as server-side proof.              |
| `challenge`, `drawing`                        | A public challenge was selected and is being prepared or displayed.                              |
| `success`                                     | Forward the browser-provided token to the backend; only backend token consumption can authorize. |
| `retry`, `cooldown`, `block`                  | Follow the decision's user-facing flow; do not invent browser-side policy rules.                 |
| `unavailable`                                 | Offer retry or follow your explicit outage policy. It is never an allow result.                  |
| `fallback`, `expired`, `consumed`, `rejected` | Keep the action pending and provide a customer-controlled recovery path.                         |

`unavailable` deliberately does not prescribe `allow`, `block`, or a fallback
action. TraceCAPTCHA does not retry decision requests automatically. The customer
application chooses whether and when to retry, use an alternative verification
path, defer the action, or apply its own availability policy. That choice must
be enforced by trusted customer application/backend logic; browser state and
visitor-modified JavaScript are not authorization evidence.

Do not use a browser callback, DOM attribute, custom event, visible canvas, or
client-provided action to complete signup, login, password reset, or OTP issue.
The page can be modified by a visitor and must be treated as untrusted input.

## Backend verification for signup

When the browser receives a verification token, forward that token to your
backend as untrusted input. The
backend must load the expected action from its own pending signup record, call
`POST /v1/tokens/verify` with its `tc_server` credential and `consume: true`,
and complete signup only after `{ "valid": true }`.

Use the copyable backend helper and complete signup example in
[Server token verification](server-token-verification.md). An unavailable,
invalid, or already-consumed token must not authorize signup. Never retry an
unknown consuming verification result automatically; begin a fresh protected
flow instead.
