# Server token verification

Use this flow only in your backend. A browser may forward a TraceCAPTCHA
verification token, but it is untrusted input and is never proof that the
protected action may proceed.

## Required sequence

1. Before displaying or accepting a CAPTCHA result, create or look up a
   server-side pending operation such as a signup, password reset, or OTP
   request. Bind it to the customer's authenticated session or other
   server-side request ownership and store its expected TraceCAPTCHA action.
2. Receive the token from the browser as untrusted input. Do not use a browser
   callback, a widget success state, or a client-provided action to authorize
   anything.
3. Derive `expectedAction` from the pending operation stored by your backend.
4. Call `POST /v1/tokens/verify` from the backend with `consume: true`.
5. Complete the pending operation only when TraceCAPTCHA returns
   `{ "valid": true }`. Mark the operation complete in your own transaction or
   durable state so it cannot be reused.

The TraceCAPTCHA token is single-use. Do not automatically retry a consuming
request after an unknown network outcome: it may have been consumed. Start a
new protected flow if the final authorization status cannot be determined.

## Node / TypeScript helper

Node 18 or later includes `fetch`; no browser SDK or cryptographic library is
needed in your backend.

```ts
type TokenVerificationOutcome =
  | { kind: "verified"; action: string; expiresAt: string }
  | { kind: "invalid" }
  | { kind: "unavailable" }
  | { kind: "misconfigured" };

type TraceCaptchaServerConfig = {
  apiOrigin: string;
  secretKey: string;
};

const maximumTokenLength = 8_192;

export async function consumeTraceCaptchaToken(
  config: TraceCaptchaServerConfig,
  token: unknown,
  expectedAction: "signup" | "login" | "password_reset" | "otp_request",
): Promise<TokenVerificationOutcome> {
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > maximumTokenLength
  ) {
    return { kind: "invalid" };
  }

  let response: Response;

  try {
    response = await fetch(new URL("/v1/tokens/verify", config.apiOrigin), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tracecaptcha-secret-key": config.secretKey,
      },
      body: JSON.stringify({ token, expectedAction, consume: true }),
    });
  } catch {
    return { kind: "unavailable" };
  }

  if (response.status === 401) {
    return { kind: "misconfigured" };
  }

  if (response.status !== 200) {
    return { kind: "unavailable" };
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return { kind: "unavailable" };
  }

  if (isVerifiedResponse(body)) {
    return {
      kind: "verified",
      action: body.action,
      expiresAt: body.expiresAt,
    };
  }

  return isInvalidResponse(body)
    ? { kind: "invalid" }
    : { kind: "unavailable" };
}

function isVerifiedResponse(
  value: unknown,
): value is { valid: true; action: string; expiresAt: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).valid === true &&
    typeof (value as Record<string, unknown>).action === "string" &&
    typeof (value as Record<string, unknown>).expiresAt === "string"
  );
}

function isInvalidResponse(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).valid === false
  );
}
```

Load `secretKey` from your backend's secret environment or secret manager. Do
not put it in browser code, a public environment variable, client logs, or an
HTTP response. A `misconfigured` result should alert operators; it must not be
treated as a successful verification. An `unavailable` result should follow
your explicit outage policy and must not authorize the protected action.

## Binding to a pending request

The action must come from server-side state, not from the HTTP request that
contains the token. For example:

```ts
const pendingSignup = await pendingSignups.findForAuthenticatedSession(
  authenticatedSession.id,
  request.body.pendingSignupId,
);

if (
  pendingSignup === null ||
  pendingSignup.status !== "awaiting_verification"
) {
  return reply.code(409).send({ error: "signup_is_not_pending" });
}

const verification = await consumeTraceCaptchaToken(
  traceCaptchaConfig,
  request.body.verificationToken,
  pendingSignup.expectedAction,
);

if (verification.kind === "verified") {
  await pendingSignups.complete(pendingSignup.id);
  return reply.code(201).send({ status: "created" });
}

if (verification.kind === "invalid") {
  return reply.code(403).send({ error: "verification_required" });
}

return reply.code(503).send({ error: "verification_unavailable" });
```

Never use `consume: false` for a state-changing operation. It is suitable only
for diagnostics and cannot authorize a signup, login, password reset, or OTP
request.
