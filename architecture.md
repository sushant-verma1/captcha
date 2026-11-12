# TraceCAPTCHA Architecture

## 1. Architectural summary

TraceCAPTCHA has two tightly related responsibilities:

```text
Risk wrapper
  decides whether verification is needed

Drawing CAPTCHA provider
  performs the interactive verification
```

The wrapper does not trust the browser to declare success. The browser collects interaction data and submits a trace, but the TraceCAPTCHA backend retrieves the secret challenge, performs validation, applies policy, and issues the final token.

## 2. High-level system

```text
                    Customer website or app
                              |
                 browser SDK / server SDK
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

## 3. Main components

### Browser SDK

Responsibilities:

- identify the customer site and protected action
- collect a minimal set of interaction signals
- request a decision from the API
- render the drawing challenge when instructed
- collect pointer traces using one pointer-event path
- submit the trace without calculating the authoritative result
- expose a simple success, retry, or failure callback

The SDK must not contain secrets, signing keys, authoritative thresholds, or the secret target path.

### Risk service

Responsibilities:

- normalize request and session context
- aggregate behavior features
- calculate an explainable risk result
- pass the result to the policy engine
- return the decision and a safe public reason category

The service should initially use deterministic rules. A future model must remain behind the same interface and must be evaluated against false positives before enforcement.

### Policy engine

The policy engine converts risk and action context into a decision:

```text
allow | challenge | retry | cooldown | block
```

Policies should be scoped by customer, site, action, and optionally environment. A signup policy does not need to equal a password-reset policy.

### Challenge service

Responsibilities:

- choose a challenge type and difficulty
- generate a random server-side seed
- generate the secret target path
- store challenge state with a short TTL
- return only the data needed to render the challenge
- enforce expiry and single-use state

The challenge state should include customer/site, action, creation time, expiry, seed, target representation, status, and attempt metadata.

### Trace validator

The validator should calculate independent metrics:

- geometric accuracy
- target coverage
- path ordering
- continuity and jump detection
- duration and pause distribution
- point spacing and timestamp regularity
- interaction naturalness indicators

Trace quality and interaction naturalness must remain separate. A perfect geometric trace may be high quality while still producing a suspicious naturalness result; that combination is a policy input, not an automatic verdict.

### Token service

After an accepted verification, the token service issues a token that is:

- a compact JWT/JWS signed with Ed25519 using the fixed `EdDSA` algorithm
- explicitly typed as `tracecaptcha-verification+jwt` and identified by a `kid`
- valid for five minutes
- bound to the customer, site, protected action, and challenge through signed claims
- identified by a unique `jti` that is atomically consumed for final authorization

The customer backend must verify the token before completing the protected action. It validates the fixed algorithm and token type, signature, issuer, audience, expiry, customer, site, action, and consumption state. The signing private key remains in managed key storage; key metadata is retained separately. The service rotates its active key every 90 days, retains retiring public verification keys for 24 hours, and immediately revokes a suspected-compromised key.

## 4. Request flows

### Risk decision flow

```text
1. Customer application identifies an action.
2. SDK/API sends site, action, session, and permitted signals.
3. API authenticates the site key and validates the request.
4. Risk service calculates features.
5. Policy engine returns allow/challenge/retry/cooldown/block.
6. The customer application follows the decision.
```

### Challenge flow

```text
1. Server creates a challenge with a secret target path.
2. Browser receives public render data and expiry.
3. User traces the target with pointer events.
4. Browser submits challenge ID and trace points.
5. Server checks customer, action, expiry, and single-use state.
6. Server validates and scores the trace.
7. Server applies policy.
8. Server issues a verification token only when accepted.
```

### Protected-action flow

```text
Customer backend receives signup/login/etc.
        |
        +--> verifies TraceCAPTCHA token server-to-server
        |
        +--> checks token action and expiry
        |
        +--> completes the protected operation
```

## 5. Trust boundaries

The browser is untrusted. It can alter JavaScript, timestamps, coordinates, and visible fields. Therefore:

- browser scores are advisory only
- browser success callbacks are not security proof
- target paths and scoring thresholds remain server-side
- signing keys never reach the browser
- customer backends verify tokens independently
- rate limits apply to challenge and verification endpoints

The server accepts only bounded browser input: public site key, action, optional session or attempt references, and trace points. It generates and stores canonical challenge state, determines expiry, scores the trace, chooses policy decisions, and issues or verifies tokens. Browser timing and expiry displays are user-interface aids only.

After request validation, a verification submission atomically consumes its challenge before scoring. A failed trace can produce `retry`, but the retry always uses a new challenge ID and fresh server-generated render state. Token verification used for final authorization atomically consumes the token; replay, wrong site/action, expiry, or an unverifiable signature is invalid. Non-consuming checks are diagnostic only.

Public site keys identify browser-facing site/environment requests and are never sufficient for token verification or administration. Private server keys remain in customer backends and authorize token verification or later privileged operations; neither key class authorizes a request until customer/site binding validation is implemented.

## 6. Data storage

### Redis

Use Redis for short-lived operational state:

- active challenge records
- expiry and single-use locks
- rate limits
- idempotency keys
- short-lived session state

### PostgreSQL

Use PostgreSQL for durable records:

- customers and sites
- site keys and configuration metadata
- policies and versions
- signing-key metadata
- aggregate outcomes
- abuse and audit summaries

Raw pointer traces should not be retained permanently by default.

For the first release, raw trace points exist only while the API validates the current request and are discarded after scoring. Active challenge state, including its consumed marker, remains only in Redis until the challenge's server-side expiry. Observability stores aggregate, non-identifying outcome counts for 90 days; security operations retain non-secret audit metadata for key/configuration changes, replay attempts, and operational security events for 90 days. Neither store receives raw traces, private keys, tokens, passwords, typed content, page contents, or browser fingerprinting data.

## 7. Failure behavior

Every protected action needs an explicit outage policy. TraceCAPTCHA returns a generic retryable `503 service_unavailable` error when a required dependency is unavailable; it does not convert an outage into an `allow`, `cooldown`, or `block` decision. The customer application owns its explicit fallback policy and may decide whether to continue its protected action. Browser code may display or retry the recoverable error, but must not authorize the action. An invalid, unavailable, or unverifiable verification token is never accepted.

## 8. Security and privacy principles

- minimize behavioral data
- document what the SDK collects
- use short retention periods
- avoid raw keystroke collection
- encrypt secrets and rotate signing keys
- bind tokens to actions
- protect against replay
- expose aggregate metrics rather than sensitive traces
- provide an accessible alternative path
