# TraceCAPTCHA test harness

This is a deliberately minimal integration surface for TraceCAPTCHA release
testing. It is not a customer dashboard or a production account workflow.

The browser page receives only the public site key. When the existing Web
Component receives a verification token, it forwards that untrusted value to
the same-origin test backend. The backend derives the expected action from its
own configuration, sends `consume: true` to TraceCAPTCHA, and reports success
only after the API atomically verifies and consumes the token.

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
