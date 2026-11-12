# MVP release readiness

TraceCAPTCHA is not production-ready. This document distinguishes the shipped
integration surface from the release-gate work that remains.

## Supported browser target

The intended supported-browser target is the current maintained stable release
of Chrome, Safari, Firefox, and Brave. Safari includes the current iOS Safari
engine where the customer's product supports it.

Chrome coverage exercises the shared Chromium web platform, so other
Chromium-based browsers are expected to be broadly compatible. They are not an
independently guaranteed or validated browser target: browser-specific privacy
features, extension behavior, and release timing can differ. Customers should
test their own required Chromium-based browser before relying on it.

The required human browser/accessibility matrix is still pending under P4.3.
It must cover the supported browsers at common zoom and device-pixel-ratio
settings, mouse/touch/stylus input where available, keyboard-only flow, and
supported screen readers.

## Integration requirements

- Use a public `tc_site` key only in browser code. Keep `tc_server` credentials
  exclusively in the customer backend.
- Treat every browser event, canvas state, local trace, and custom-element
  callback as untrusted UI data, never authorization evidence.
- Apply `allow`, `challenge`, `retry`, `cooldown`, and `block` decisions through
  the customer's trusted application policy.
- On `unavailable`, choose the customer-owned retry, fallback, defer, or
  availability behavior in trusted application/backend code.
- Verify and atomically consume every browser-provided verification token
  server-to-server before completing a protected action.
- Provide a customer-controlled accessible alternative for users unable to
  complete a drawing interaction.

## Known limits

- Challenge verification now consumes an active server-held challenge before
  scoring, applies the provisional server policy, and returns a short-lived
  action-bound token only for an accepted trace. Verification requests have
  independent site/action and network rate-limit policy entries.
- Trace-acceptance thresholds remain provisional and require real
  usability/abuse calibration before production enforcement.
- Completion, retry, and observed expiry aggregates are recorded; abandonment
  cannot be measured until an explicit non-identifying source is defined.
- Aggregate operational metrics cover decision outcomes, challenge
  creation/replay, authenticated dependency unavailability, and one-action
  false-positive reports from trusted customer backends. They do not store raw
  traces, sessions, network addresses, tokens, scores, policy rules, or other
  event identifiers. Customer backends may call
  `POST /v1/observability/false-positive-reports` with their private credential
  and `{ "action": "..." }` only; this report is operational telemetry and
  never authorizes a protected action.
- Human browser/accessibility QA and the complete end-to-end release scenarios
  have not been run.

## Release gate

Do not describe TraceCAPTCHA as production-ready until the P10.1 scenarios
pass, the P4.3 human QA is recorded, trace thresholds are calibrated, and all
known limits above are reconciled with the shipped API and SDK behavior.
