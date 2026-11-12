# TraceCAPTCHA Project Specification

## 1. Product definition

TraceCAPTCHA is an adaptive CAPTCHA platform with two responsibilities:

1. **Owned drawing CAPTCHA provider** — users trace a generated shape on a canvas and the TraceCAPTCHA server validates the trace.
2. **Risk-based wrapper** — TraceCAPTCHA evaluates the protected action and available behavior signals, then decides whether to allow it silently, show the drawing CAPTCHA, request another attempt, apply a cooldown, or block it.

The provider and wrapper are part of the same product. TraceCAPTCHA is not an integration marketplace for third-party CAPTCHA providers.

```text
Customer website or app
          |
          v
TraceCAPTCHA SDK/API
          |
          v
Risk and policy decision
   |          |          |          |
 allow    challenge    retry    cooldown/block
              |
              v
       TraceCAPTCHA drawing CAPTCHA
              |
              v
       Server-side verification token
```

The wrapper removes repeated CAPTCHA-triggering logic from customer applications. Customers identify the protected action; TraceCAPTCHA applies the configured policy.

TraceCAPTCHA is a probabilistic anti-abuse control. It does not prove that a visitor is definitely human and it is not a complete fraud-detection platform.

## 2. Goals

### Primary goals

- Provide an embeddable drawing CAPTCHA for websites and applications.
- Decide when a protected action needs a challenge.
- Keep challenge generation, scoring, and acceptance server-authoritative.
- Support mouse, touch, and stylus input.
- Generate short-lived, single-use, action-bound verification tokens.
- Give customers simple integration instead of repeated CAPTCHA-triggering logic.
- Make risk decisions explainable enough to tune and investigate.
- Minimize collection and retention of behavioral data.
- Provide reliable metrics for usability, abuse, and false-positive analysis.

### Secondary goals

- Keep the browser integration framework-neutral.
- Provide optional React and other framework adapters after the core SDK is stable.
- Support configurable policies per customer, site, environment, and protected action.
- Provide a safe retry and accessible fallback path.
- Keep the service lightweight enough for high-volume challenge and verification requests.

## 3. Non-goals

TraceCAPTCHA is not initially intended to be:

- a replacement for a complete enterprise fraud platform
- a guarantee of human identity or intent
- a biometric system
- a device-fingerprinting product
- a collection system for passwords, keystrokes, page contents, or unrelated browsing data
- a machine-learning system from the first release
- a marketplace that selects among external CAPTCHA vendors
- an accessibility replacement that offers only drawing to every user

## 4. Terminology

| Term                    | Meaning                                                                          |
| ----------------------- | -------------------------------------------------------------------------------- |
| Customer                | An organization using TraceCAPTCHA                                               |
| Site                    | A registered website, mobile app, or application environment owned by a customer |
| Action                  | The protected operation, such as signup, login, or password_reset                |
| Session                 | A customer-provided or TraceCAPTCHA session identifier used to correlate a flow  |
| Challenge               | A short-lived drawing task generated for one site and action                     |
| Trace                   | The submitted sequence of pointer coordinates and timing data                    |
| Trace quality           | How accurately and completely the user followed the target                       |
| Interaction naturalness | How regular, automated, or otherwise anomalous the interaction appears           |
| Risk                    | An internal estimate that the action should receive additional friction          |
| Decision                | allow, challenge, retry, cooldown, or block                                      |
| Verification token      | A signed result that a customer backend can verify before completing an action   |

## 5. End-to-end behavior

### 5.1 Low-risk action

```text
Customer requests protection for an action
        |
        v
TraceCAPTCHA evaluates context and policy
        |
        v
ALLOW
```

The user does not see a CAPTCHA.

### 5.2 Elevated-risk action

```text
Customer requests protection for an action
        |
        v
TraceCAPTCHA returns CHALLENGE
        |
        v
Browser requests/renders a drawing challenge
        |
        v
User traces the shape
        |
        v
TraceCAPTCHA validates the trace server-side
        |
        +--> accepted: issue verification token
        +--> rejected: retry, cooldown, or block by policy
```

### 5.3 Protected action

The customer backend must verify the returned token before completing the protected action. A browser callback is only a user-interface signal and is not security proof.

## 6. Public integration model

The customer should not implement its own rules for when to show CAPTCHA. It supplies the site, action, and permitted context to the SDK or API.

Conceptual browser usage:

```ts
const decision = await traceCaptcha.protect({
  action: "signup",
});

if (decision.type === "challenge") {
  // The SDK renders the TraceCAPTCHA drawing challenge.
}
```

The customer backend sends the resulting verification token to TraceCAPTCHA or verifies it through a server SDK before accepting the protected request.

### 6.1 Decision values

```text
allow      No challenge is required.
challenge  Display a fresh drawing challenge.
retry      Ask the user to try a new challenge.
cooldown   Temporarily slow or stop attempts.
block      Reject the action according to policy.
```

Customers may receive a safe public reason category, but internal thresholds, detailed features, and anti-abuse rules must not be exposed.

### 6.2 Initial protected actions and outage behavior

The first-release action identifiers are `signup`, `login`, `password_reset`, and `otp_request`. They are stable, lowercase identifiers used by browser and server integrations; customers may later configure policies for additional actions.

```text
allow      The customer application may continue without a challenge.
challenge  The browser obtains and displays a fresh TraceCAPTCHA challenge.
retry      The user may retry the verification flow; this is not proof of success.
cooldown   The customer application temporarily pauses attempts before another flow begins.
block      The customer application rejects the protected action according to its policy.
```

An unavailable TraceCAPTCHA dependency is not a policy decision. For any action, TraceCAPTCHA returns a generic `503 service_unavailable` error instead of `allow`, `cooldown`, or `block`. The customer application chooses whether its own explicit fallback permits the protected action. Browser code may present the recoverable error, but it must not treat the error as verification success. An unavailable or unverifiable verification token is always invalid.

## 7. System architecture

```text
                    Customer website or app
                              |
                 Browser SDK / Server SDK
                              |
                              v
                       TraceCAPTCHA API
             +----------------+----------------+
             |                |                |
             v                v                v
       Risk service     Challenge service   Token service
             |                |                |
             v                v                v
       Policy engine     Trace validator    Key/signing store
             |                |
             +--------+-------+
                      v
                 Redis / PostgreSQL
```

### 7.1 Browser SDK

The SDK:

- identifies the customer site and protected action
- collects a minimal, documented set of behavior signals
- requests a risk decision
- renders the drawing challenge when instructed
- collects pointer traces
- sends the trace to the API
- exposes success, retry, cooldown, and failure states

The SDK must not contain signing keys, private credentials, authoritative thresholds, or the canonical target representation.

### 7.2 Risk service

The risk service:

- validates and normalizes request context
- aggregates permitted session and behavior features
- calculates an explainable risk result
- returns reason categories safe for customer diagnostics
- passes the result to the policy engine

The first risk engine is deterministic and rule-based. A future statistical model must remain behind the same interface and must be evaluated for false positives before enforcement.

### 7.3 Policy engine

The policy engine maps risk, action, customer policy, and system state to a decision. Policies are scoped by customer, site, environment, and action.

Example:

```text
low risk + signup                -> allow
medium risk + signup             -> challenge
failed challenge once            -> retry
many failures in a short period -> cooldown
replayed token or obvious abuse -> block
```

### 7.4 Challenge service

The challenge service:

- chooses the supported challenge type and difficulty
- generates a random server-side seed
- creates the canonical target path
- stores challenge state with a short TTL
- returns only public render data
- enforces expiry and single-use state

The visible drawing is necessarily observable by a browser. Keeping the canonical path, scoring tolerances, and authoritative validation data private prevents trivial client-side forgery but cannot guarantee resistance to sophisticated automation.

### 7.5 Trace validator

The trace validator calculates independent metrics:

- geometric accuracy
- target coverage
- path ordering
- continuity and jump detection
- drawing duration
- pause distribution
- point spacing and timestamp regularity
- interaction naturalness indicators

Trace quality and interaction naturalness must remain separate. A perfect trace can have excellent trace quality while still being suspicious because of highly regular or synthetic interaction characteristics.

### 7.6 Token service

After an accepted verification, the token service issues a token that is:

- signed
- short-lived
- single-use where practical
- bound to the customer and site
- bound to the protected action
- optionally bound to a session or request nonce

## 8. Behavior and risk engine

### 8.1 Processing pipeline

```text
Permitted request/session signals
              |
              v
Validated and normalized context
              |
              v
Feature extraction
              |
              v
Rule evaluation
              |
              v
Risk band + internal reason codes
              |
              v
Customer/action policy
              |
              v
allow / challenge / retry / cooldown / block
```

### 8.2 Initial signals

Use signals conservatively, such as:

- request velocity by site, action, session, IP, and account where available
- recent failed attempts
- session age and continuity
- action sensitivity
- challenge expiry or replay
- prior customer-provided abuse signals
- trace quality
- interaction naturalness
- repeated identical traces or submissions

The system must not treat one signal as proof of automation. Behavior signals are noisy and can be unusual for legitimate users, accessibility tools, mobile devices, privacy tools, or poor networks.

### 8.3 Perfect-trace handling

A 100% geometrically accurate trace should not automatically fail. It may increase suspicion only when combined with other evidence, for example:

- perfectly uniform movement speed
- perfectly uniform point spacing
- no corrections or natural pauses
- deterministic event timing
- impossible event intervals
- repeated identical traces across sessions
- a trace submitted immediately and repeatedly

The preferred outcome for a suspicious perfect trace is a policy decision such as retry, cooldown, or additional verification—not a hidden hard-coded penalty that blocks careful legitimate users.

### 8.4 Risk outputs

The engine may maintain internal values such as:

```text
traceQuality
interactionNaturalness
riskScore
```

These values should not be exposed to the browser by default. Customers usually need the decision and a coarse reason category, not the scoring formula.

## 9. Drawing CAPTCHA design

### 9.1 Initial challenge scope

The MVP should use one reliable challenge family, such as a simple closed polygon. Additional shapes can be added after validation quality and usability are measured.

Later challenge families may include circles, waves, zigzags, stars, spirals, irregular paths, and compound paths.

### 9.2 Challenge properties

Each challenge should have:

- unique ID
- site and action binding
- server-generated seed
- challenge type and difficulty
- render transformation such as position, rotation, and scale
- creation time
- expiry time
- single-use status
- secret canonical target representation

The initial server-side challenge lifetime is two minutes. This expiry is enforced by the server and its Redis TTL; browser timers only communicate the deadline to users.

### 9.3 Browser drawing

Use:

- HTML Canvas
- Pointer Events
- pointer capture where appropriate
- canvas-relative coordinates
- bounded event sampling or coalescing
- client-side visual feedback only

Each submitted point may include:

```json
{
  "x": 101,
  "y": 83,
  "t": 18
}
```

Coordinates and timing values are untrusted input.

### 9.4 Trace normalization

The server should:

1. validate point count and coordinate bounds
2. remove duplicate or meaningless points
3. normalize coordinates relative to the challenge canvas
4. simplify excessive points safely
5. resample user and target paths at comparable spacing
6. compare geometry and ordering
7. calculate coverage and continuity
8. calculate interaction features separately

Do not compare U1 directly to T1, U2 to T2, and so on. Users draw at different speeds.

### 9.5 Trace quality

The initial validator should measure:

- distance from user points to target segments
- target path coverage
- whether the target was followed in the intended order
- disconnected segments and large jumps
- start/end tolerance
- excessive or incomplete drawing

Thresholds must be calibrated using test traces rather than treated as universal constants.

## 10. API surface

The public API is described with OpenAPI and versioned under /v1.

### 10.1 Versioning and compatibility

The URL major version is the compatibility boundary. Within `/v1`, TraceCAPTCHA may
add endpoints and optional request or response fields. SDKs and customer integrations
must ignore response fields they do not recognize.

Removing or changing an existing field, authentication mechanism, status-code
semantics, validation constraint, or decision value requires a new URL major version.
Deprecated behavior remains documented until the next major version is available; it
is not silently removed from `/v1`.

### Create or request a decision

```http
POST /v1/decisions
X-TraceCAPTCHA-Site-Key: site_public_key
```

Request concept:

```json
{
  "action": "signup",
  "sessionId": "session_123",
  "context": {
    "attemptId": "attempt_456"
  }
}
```

Response concept:

```json
{
  "decision": "challenge",
  "challengeId": "ch_123",
  "expiresAt": "2026-11-07T12:00:30Z"
}
```

### Create a challenge

```http
POST /v1/challenges
X-TraceCAPTCHA-Site-Key: site_public_key
```

This can be called directly by an authorized server integration or by the decision flow. It returns public render data only.

### Verify a challenge

```http
POST /v1/challenges/{challengeId}/verify
X-TraceCAPTCHA-Site-Key: site_public_key
```

Request concept:

```json
{
  "action": "signup",
  "trace": [
    { "x": 101, "y": 83, "t": 0 },
    { "x": 105, "y": 86, "t": 18 }
  ]
}
```

Response concept:

```json
{
  "decision": "allow",
  "verificationToken": "vct_...",
  "expiresAt": "2026-11-07T12:01:30Z"
}
```

Numerical scores are not returned by default. If a diagnostic score is ever exposed to an authorized customer dashboard, it must not be treated as a security credential.

### Verify a token

```http
POST /v1/tokens/verify
X-TraceCAPTCHA-Secret-Key: server_secret_key
```

The customer backend uses this endpoint or a server SDK to verify signature, expiry, action, site, audience, and single-use state.

### 10.1 Verification token profile

TraceCAPTCHA verification tokens use compact JWT/JWS serialization signed with an Ed25519 key using the fixed `EdDSA` algorithm. The protected header is exactly scoped to this token type:

```json
{
  "alg": "EdDSA",
  "typ": "tracecaptcha-verification+jwt",
  "kid": "active-signing-key-id"
}
```

The signed claims are `iss` (the configured deployment issuer), `aud` (the issuing site ID, used as the customer audience), `iat`, `exp`, `jti`, `customerId`, `siteId`, `action`, and `challengeId`. Tokens expire five minutes after issue. They contain no raw trace data, scores, browser signals, secrets, passwords, typed content, or other personal data. JWT payloads are readable to token holders, so signing prevents modification but does not make claims confidential.

The verifier accepts only `EdDSA` tokens of the declared type and validates every signature, issuer, audience, expiry, customer, site, action, and token ID before authorizing a protected action. Final authorization calls atomically consume the `jti`; a consumed token is a replay and invalid. A non-consuming verification remains diagnostic only.

The active Ed25519 private key is held only in a managed key-management or secrets service. PostgreSQL stores key metadata, including `kid`, lifecycle status, and creation, activation, retirement, and revocation timestamps; it never stores private key material. Rotate the active signing key every 90 days and immediately after suspected compromise. Sign only with the active key. Retain retiring public verification keys for 24 hours so unexpired tokens can be validated, then remove them; a revoked key is rejected immediately even if its tokens have not expired. The first release verifies tokens through the secret-key-protected API or server SDK and does not distribute public verification keys.

### Configuration endpoints

Configuration APIs should manage:

- sites and environments
- public and private key metadata
- action policies
- challenge lifetime and retry limits
- retention settings
- outage behavior

## 11. Data model

### Challenge

```text
id
customerId
siteId
action
seed
challengeType
renderVersion
targetRepresentation
createdAt
expiresAt
usedAt
status
```

### Decision record

```text
id
customerId
siteId
action
sessionReference
decision
riskBand
reasonCategories
policyVersion
createdAt
```

### Verification token record

```text
tokenId
customerId
siteId
action
challengeId
issuedAt
expiresAt
consumedAt
status
```

Raw traces should be short-lived or discarded after validation unless a documented diagnostic mode, retention policy, and lawful basis require otherwise.

## 12. Storage and deployment

### Redis

Use Redis for:

- active challenge state
- challenge expiry
- single-use locks
- rate limits
- idempotency keys
- short-lived session/risk context

### PostgreSQL

Use PostgreSQL for:

- customers and sites
- policies and policy versions
- key metadata
- aggregate outcomes
- abuse summaries
- audit records

### Baseline deployment

```text
CDN / edge protection
          |
          v
TraceCAPTCHA API
      |       |
      v       v
   Redis   PostgreSQL
```

Start with one API deployment and managed Redis/PostgreSQL. Add workers or an event pipeline only when traffic and analytics requirements justify them.

## 13. Security model

The browser is untrusted. It can modify JavaScript, coordinates, timestamps, callbacks, and visible fields.

### 13.1 Trust-boundary rules

The browser may submit a public site key, an action, optional session or attempt references, and bounded trace points. All of those values are untrusted inputs. The browser may render public challenge data and present server responses, but it must not receive canonical target data, scoring tolerances, risk thresholds, signing keys, or private server credentials.

The server alone generates challenge identifiers and seeds, retains canonical targets, calculates trace quality and interaction naturalness, evaluates risk and policy, determines challenge expiry and consumption, and issues or verifies tokens. A client-provided score, success flag, callback, timestamp, or visible field never authorizes a protected action.

A challenge is bound to its customer, site, action, and, when provided, session reference. Its server-side expiry is authoritative; a browser timer only informs the user interface. After request validation, the first syntactically valid trace verification submission atomically locks and consumes the challenge before scoring. Concurrent or later submissions receive a consumed result. A failed trace may return `retry`, but the retry must create a new challenge with a new identifier and fresh server-generated seed and render state. Expired, consumed, or cross-site/action challenges cannot be verified.

Verification tokens are accepted only after the server verifies their signature, expiry, customer, site, action, and required audience or session binding. The customer backend must make the final authorization check with one-time consumption enabled; that consumption is atomic. A consumed token is a replay and cannot authorize another protected action. A non-consuming verification is diagnostic only and cannot be used as final authorization.

When idempotency is added for state-changing operations, the same customer, endpoint, idempotency key, and request fingerprint must return the original result. Reusing a key with a different request fingerprint must fail rather than applying a second operation. Stored idempotency results expire with the associated short-lived operation state and never create another challenge, token, or consumption event.

Public site keys identify a customer site and environment for browser-facing decision and challenge requests. They may be visible in browser code, but they cannot verify tokens, administer configuration, or grant cross-site access. Private server keys are used only by customer backends for token verification and later privileged operations; they never enter browser bundles, logs, or public responses. Phase 2 must enforce the customer/site/environment association and key lifecycle before either key type authorizes a domain operation.

### 13.2 Initial threat model

| Surface            | Likely attacker behavior                                                                                                                         | Required control                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Challenge creation | Use a public key from another origin, request an unregistered action, or create excessive challenges.                                            | Validate the registered site and action, bind the challenge server-side, and apply site/action/session rate limits.                                                      |
| Trace submission   | Modify JavaScript, forge a score, alter timestamps or coordinates, inspect visible render data, replay a challenge, or race concurrent requests. | Treat input as untrusted; retain canonical data and scoring server-side; enforce bounds, expiry, site/action binding, and atomic first-submission consumption.           |
| Token verification | Forge a token, replay a valid token, submit it for a different site/action, or expose a private credential.                                      | Verify server-side signature and claims; atomically consume final-use tokens; keep private keys server-only, redact them from logs, and support rotation and revocation. |

Required controls:

- never trust client-provided score or success flags
- keep signing keys and canonical target representations server-side
- validate all input with strict bounds and size limits
- expire every challenge
- invalidate every challenge after its allowed verification attempt
- prevent verification-token replay
- bind tokens to customer, site, action, and expiry
- rate-limit decision, challenge, and verification endpoints
- use idempotency protection for repeated requests
- rotate signing keys safely
- avoid logging secrets and raw sensitive behavior
- monitor abuse of the CAPTCHA endpoints themselves

TraceCAPTCHA should be described as increasing the cost of automation, not making automation impossible.

## 14. Privacy and accessibility

### Privacy principles

- collect only signals necessary for a configured decision
- do not collect passwords, raw keystrokes, or page contents
- prefer aggregate features over raw event storage
- document collection in customer-facing integration material
- define retention by data type
- restrict dashboard access to authorized customer users
- provide deletion and export behavior for retained customer data where required

Customers remain responsible for their own notices, consent decisions, retention settings, and legal obligations.

### 14.1 Initial collection and retention policy

The first browser integration submits only the public site key, protected action, optional `sessionId` or `attemptId`, and the canvas-relative trace points required to verify an active challenge. It does not collect passwords, raw keystrokes, typed content, page content, device fingerprints, or unrelated page interactions. The server derives trace-quality and interaction-naturalness results itself; the browser does not submit a score or success flag.

| Data category                              | Owner and purpose                                                                                                                           | Default retention                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Request fields and raw trace points        | API and trace validator; validate the current request and score its active challenge.                                                       | Memory only for the request lifetime; discard immediately after scoring. Never persist raw traces by default.        |
| Active challenge state and consumed marker | Challenge service; bind a challenge to site/action/session and enforce expiry and first-submission consumption.                             | Redis only until the challenge's server-side expiry.                                                                 |
| Derived verification outcome               | Policy and observability services; count pass, retry, cooldown, block, expiry, abandonment, and replay outcomes without storing raw traces. | Aggregate, non-identifying counts only; retain for 90 days.                                                          |
| Security audit metadata                    | Security operations; investigate key/configuration changes, replay attempts, and operational security events.                               | Retain non-secret metadata for 90 days. Never include raw traces, private keys, tokens, passwords, or typed content. |

The initial risk policy uses only the action, optional session or attempt reference, and server-derived challenge results. Network-rate controls may use infrastructure-provided data in a later phase, but the browser SDK does not collect or transmit additional fingerprinting signals for that purpose.

### Accessibility principles

A drawing-only CAPTCHA will not work for every user. Production deployments must provide an alternative or customer-controlled recovery path. Keyboard navigation, visible focus, readable instructions, touch usability, and screen-reader labeling should be treated as product requirements rather than late polish.

## 15. Rate limiting and abuse controls

Apply limits at multiple levels:

- customer/site
- action
- IP or network indicator where appropriate
- session
- account or identifier where appropriate
- challenge creation
- challenge verification

Repeated failures should lead to a configurable cooldown, not an unbounded stream of fresh challenges.

## 16. Observability

Record aggregate metrics such as:

- decision counts by action
- challenge rate
- challenge completion rate
- pass, retry, cooldown, and block rates
- abandonment rate
- challenge expiry rate
- average completion duration
- trace-quality distribution
- interaction-naturalness distribution
- false-positive reports
- token replay attempts
- API and Redis failure rates

Do not expose detailed anti-abuse rules or sensitive raw traces through customer dashboards.

## 17. Testing requirements

### Geometry tests

- accurate trace
- incomplete trace
- offset trace
- reordered trace
- disconnected trace
- duplicate points
- excessive points
- out-of-bounds coordinates

### Risk and policy tests

- low-risk allow
- medium-risk challenge
- failed challenge retry
- repeated failures cooldown
- replay block
- perfect geometry with natural interaction
- perfect geometry with synthetic regularity
- accessibility fallback

### Security tests

- modified client score
- modified challenge ID
- expired challenge
- already-used challenge
- wrong action token
- wrong site token
- expired token
- replayed token
- duplicate request
- rate-limit exhaustion

### Browser tests

- mouse
- touch
- stylus-like pointer input
- pointer cancellation
- canvas resizing
- slow network
- refresh during challenge
- mobile viewport

## 18. Delivery plan

### Phase 0 — Contracts and threat model

- finalize public API types
- define token claims and key rotation
- document trust boundaries
- define data collection and retention
- choose default action policies

### Phase 1 — Drawing provider

- implement one challenge family
- implement canvas rendering and pointer collection
- implement server-side normalization and geometry validation
- implement expiry, single-use state, and token issuance

### Phase 2 — Embeddable integration

- implement framework-neutral browser SDK
- provide Web Component and imperative API
- provide server verification examples
- publish OpenAPI contract

### Phase 3 — Risk wrapper

- implement behavior summary collection
- implement deterministic risk rules
- implement policy decisions
- add observe-only mode
- add action-specific configuration

### Phase 4 — Reliability and abuse controls

- add rate limits and cooldowns
- add replay protection and idempotency
- add health monitoring
- add safe outage behavior
- add accessibility and recovery paths

## 19. MVP definition

The MVP is complete when:

- a customer can register a site and protected action
- low-risk requests can be allowed without a CAPTCHA
- elevated-risk requests invoke the owned drawing CAPTCHA
- one drawing challenge family renders correctly
- mouse and touch input work
- the server stores the canonical challenge state
- the server validates accuracy, coverage, ordering, and continuity
- trace quality is separate from interaction naturalness
- perfect traces are not automatically failed
- challenges expire and are single-use
- accepted verification produces a short-lived, action-bound token
- the customer backend can verify the token
- rate limits protect challenge and verification endpoints
- aggregate outcomes are measurable
- no service is trusted merely because the browser reports success

## 20. Success criteria

### Usability

Legitimate users complete challenges quickly and can recover from an unsuccessful attempt.

### Reliability

Equivalent interactions produce consistent decisions across supported devices without making one unusual device profile an automatic failure.

### Security

Simple automation cannot trivially forge a successful verification token or replay an old challenge.

### Server authority

The client cannot declare a successful verification by changing a score, callback, or visible field.

### Measurability

Customers and operators can measure challenge friction, completion, failure, expiry, abuse, and false-positive signals.

### Privacy and accessibility

Behavior collection is limited and documented, and users who cannot complete a drawing challenge have a defined alternative path.
