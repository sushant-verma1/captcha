# TraceCAPTCHA test harness

This is a deliberately minimal integration surface for TraceCAPTCHA release
testing. It is not a customer dashboard or a production account workflow.

The browser page receives only the public site key. When the existing Web
Component receives a verification token, it forwards that untrusted value to
the same-origin test backend. The backend derives the expected action from its
own configuration, sends `consume: true` to TraceCAPTCHA, and reports success
only after the API atomically verifies and consumes the token.

The harness permits inline styles because the existing Web Component creates
styles in its Shadow DOM and sets canvas sizing styles at runtime. It keeps
scripts nonce-restricted and sends `frame-ancestors 'none'` in the HTTP Content
Security Policy response header.

## Manual staging-QA checklist

Run this only against the deployed staging harness after the API and harness are
on the intended revision. Record the device/browser, outcome, safe decision and
reason category, and whether the server-side test result was authorized. Do not
record or expose tokens, scores, thresholds, measurements, raw traces, secrets,
or policy rules.

- [ ] **Mouse:** trace the guide clockwise and counterclockwise. Confirm a normal
      drag paints continuously and reaches the server result (mouse moves report
      `button: -1` after the press).
- [ ] **Touch and stylus:** repeat one accurate trace with each supported input
      type; confirm capture, drawing, and terminal result work without page scroll.
- [ ] **Permitted human variation:** test a small open gap, rounded/hand-drawn
      corners, and a short correction tail. Each otherwise complete outline should
      be accepted and reach the server-side authorized test result.
- [ ] **Rejected geometry:** submit a dot, a partial straight line, a random
      scribble, and repeated loops around the guide. Each must receive a recoverable
      retry/rejection result and must not authorize the test outcome.
- [ ] **Recovery and accessibility:** use keyboard-only navigation to check
      visible focus and instructions; use Escape/reset, retry, challenge expiry,
      and an unavailable API state. With a supported screen reader, confirm status
      changes and the customer-controlled fallback/recovery control do not trap the
      user.
- [ ] **Server decision and result recording:** confirm the diagnostics show
      only widget state, safe decision, safe reason category, and token-handoff
      status. For an accepted trace, confirm the server-side `/verify` outcome is
      authorized only after atomic token verification/consumption; inspect
      aggregate staging records/logs only for decision/result counts and never for
      protected scoring data.

These scenarios support calibration only. They do not complete P4.3, P9.5, or
P10.1, and they do not establish production readiness.

## Configuration

Set these server-side environment variables when deploying the harness. Do not
put the private credential in browser configuration, source code, logs, or an
HTTP response.

| Variable                                   | Purpose                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `TRACE_CAPTCHA_TEST_HARNESS_API_ORIGIN`    | Exact TraceCAPTCHA API origin, for example `https://captcha.example.com`                          |
| `TRACE_CAPTCHA_TEST_HARNESS_PUBLIC_ORIGIN` | Exact public harness origin, for example `https://captcha-test.example.com`                       |
| `TRACE_CAPTCHA_TEST_HARNESS_SITE_KEY`      | Public `tc_site_...` credential exposed to the browser                                            |
| `TRACE_CAPTCHA_TEST_HARNESS_SECRET_KEY`    | Private `tc_server_...` credential; server-only                                                   |
| `TRACE_CAPTCHA_TEST_HARNESS_ACTION`        | Optional fixed action; defaults to `password_reset` to exercise the conservative challenge policy |
| `PORT`                                     | Optional listener port; defaults to `3001`                                                        |

Register the hostname from `TRACE_CAPTCHA_TEST_HARNESS_PUBLIC_ORIGIN` during
the one-time bootstrap. It must be the test page's hostname, not the API
hostname. The harness rejects token-submission requests whose `Origin` does not
exactly match its configured public origin.

## Deployment and test boundary

Build the workspace, then run `pnpm --filter @tracecaptcha/test-harness run
start` in a separately configured web service. Do not use the browser's
`allow`, success event, local trace, or returned token as authorization. A
`201` response from the harness `/verify` endpoint is the narrow test outcome
that confirms the backend consumed a valid token.

No real account, password reset, analytics record, raw trace, or user data is
created by this application. It exists to run the P4.3, P9.5, and P10.1 human
test scenarios after the operator provisions the configured site.
