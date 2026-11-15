# TraceCAPTCHA Implementation Plan

## Product direction

TraceCAPTCHA is both an owned drawing CAPTCHA provider and a risk-based wrapper. The provider performs drawing verification; the wrapper decides when a customer action needs that verification.

Customers identify the protected action. TraceCAPTCHA returns one of:

```text
allow | challenge | retry | cooldown | block
```

## How to use this plan

Tasks are ordered by dependency. Work through one task at a time and mark it complete only when its acceptance check is met. Keep pull requests or changes focused on one task or a small group of tightly related tasks.

- [ ] not started
- [~] in progress
- [x] complete

A task may be split further if it cannot be reviewed or completed as one focused change. Record meaningful decisions and completed work in notes.md. Do not start services unless the active task requires it and the user has asked for implementation.

## Product goals

- Provide an embeddable drawing CAPTCHA for websites and apps.
- Automatically decide when a protected action needs a challenge.
- Validate challenges and issue results on the server.
- Support mouse, touch, and stylus input.
- Issue short-lived, single-use, action-bound verification tokens.
- Keep behavior data limited and decisions explainable.
- Make retry and accessible recovery paths available.

## First-release boundaries

- One drawing challenge family.
- Deterministic, rule-based risk policies.
- Framework-neutral browser integration first.
- No third-party CAPTCHA provider integrations.
- No machine-learning model until outcome data supports evaluation.
- No permanent raw trace storage by default.
- A perfect geometric trace is a signal to evaluate with other evidence, never an automatic failure.

---

## Phase 0 — Agree on contracts and boundaries

**Goal:** remove unresolved security, privacy, and API choices before implementation.

### P0.1 — Confirm protected actions and decision meanings [x]

- [x] Choose the initial action names: signup, login, password reset, and OTP request.
- [x] Define what each decision means to the customer integration.
- [x] Define which actions may retry, cool down, block, or allow during service outages.

**Done when:** the action names and decision semantics are written down and used consistently in API examples.

### P0.2 — Define API request and response contracts [x]

- [x] Specify decision, challenge creation, challenge verification, and token verification requests.
- [x] Define authentication headers, required fields, size limits, status codes, and error format.
- [x] Write the OpenAPI contract for the agreed /v1 endpoints.
- [x] Define versioning and compatibility rules.

**Done when:** browser SDK, server integration, and API can be implemented against the same reviewed contract.

### P0.3 — Define security and trust boundaries [x]

- [x] Document what the browser may submit and what the server must calculate.
- [x] Define challenge expiry, single-use rules, token replay behavior, and idempotency behavior.
- [x] Define site-key and server-key responsibilities.
- [x] Write the first threat model for challenge creation, trace submission, and token verification.

**Done when:** no security decision depends on trusting a browser-provided score or success flag.

### P0.4 — Define collected data and retention [x]

- [x] List the browser signals needed for the first risk policy.
- [x] Explicitly exclude passwords, raw keystrokes, typed content, and page contents.
- [x] Decide whether any raw trace data is retained; default to discarding it after scoring.
- [x] Define retention for challenge state, aggregate outcomes, and security audit records.

**Done when:** each stored field has a purpose, owner, and retention behavior.

### P0.5 — Define token claims and signing-key lifecycle [x]

- [x] Specify token claims for customer, site, action, issue time, expiry, and unique token ID.
- [x] Decide token format and one-time consumption strategy.
- [x] Define key storage, rotation, and key identifier behavior.

**Done when:** a customer backend can determine whether a token belongs to the right site and action and is still valid.

---

## Phase 1 — Establish the service foundation

**Depends on:** Phase 0 contracts and boundaries.

**Goal:** create the smallest service foundation needed for customer configuration and challenge workflows.

### P1.1 — Create the workspace and package boundaries [x]

- [ ] Set up a TypeScript workspace for API, browser SDK, shared types, and challenge/risk modules.
- [ ] Add consistent formatting, linting, type-checking, and build scripts.
- [ ] Keep the first deployment as one API application; use modules/packages for internal boundaries.

**Done when:** each package builds independently and shared contracts have a single source of truth.

### P1.2 — Add API runtime and configuration loading [x]

- [x] Create the API application and route registration.
- [x] Validate required environment configuration at startup.
- [x] Separate public configuration from secrets.
- [x] Add structured request logging with sensitive values redacted.

**Done when:** invalid or missing configuration prevents the service from starting safely.

### P1.3 — Add common request validation and error handling [x]

- [x] Add runtime schemas for incoming requests.
- [x] Set request body and trace size limits.
- [x] Define a consistent error response format.
- [x] Ensure unexpected errors do not reveal secrets or internal scoring details.

**Done when:** malformed requests receive predictable client errors and are not passed into domain logic.

### P1.4 — Add health and readiness checks [x]

- [x] Add liveness and readiness endpoints.
- [x] Check required dependencies without exposing credentials or detailed infrastructure information.
- [x] Distinguish an alive process from a service ready to accept verification traffic.

**Done when:** deployment monitoring can detect a process failure and a dependency failure separately.

---

## Phase 2 — Customer, site, and policy identity

**Depends on:** Phase 1.

**Goal:** make every request attributable to the correct customer, site, environment, and action.

### P2.1 — Create customer and site records [x]

- [x] Define customer, site, and environment records.
- [x] Add database migrations and indexes for lookup paths.
- [x] Associate allowed hostnames or app identifiers with each site.

**Done when:** a site is explicitly registered and cannot be confused with another customer's site.

### P2.2 — Issue and validate site credentials [x]

- [x] Create public site keys for browser use.
- [x] Create private server credentials for protected operations.
- [x] Store only safe credential metadata or hashes where possible.
- [x] Add key revocation and rotation behavior.

**Done when:** public keys identify a site but cannot perform private administrative or token-verification operations.

### P2.3 — Define initial action policies [x]

- [x] Store policy configuration per site and action.
- [x] Set conservative defaults for the initial protected actions.
- [x] Version policy changes so decision records can be explained later.

**Done when:** policy selection is deterministic for a given site, action, and policy version.

---

## Phase 3 — Generate and manage drawing challenges

**Depends on:** Phases 1 and 2.

**Goal:** create bounded, expiring challenges whose authoritative target stays on the server.

### P3.1 — Define challenge and render-data types [x]

- [x] Define challenge ID, site/action binding, type, seed, creation time, expiry, and status.
- [x] Define the public render data returned to the browser.
- [x] Define which canonical target data remains private.

**Done when:** the browser can render a challenge without receiving scoring secrets.

### P3.2 — Implement the first shape generator [x]

- [x] Implement one simple shape family for the MVP.
- [x] Generate a cryptographically secure random seed on the server.
- [x] Apply bounded variation in size, position, and rotation.
- [x] Keep shape geometry inside the supported canvas bounds.

**Done when:** generated challenges vary while remaining drawable and validatable.

### P3.3 — Store challenges with expiry and single-use state [x]

- [x] Store short-lived challenge state in Redis.
- [x] Bind challenge state to customer, site, action, and session reference where available.
- [x] Enforce expiry server-side.
- [x] Ensure verification attempts atomically consume or lock the challenge.

**Done when:** expired or already-consumed challenges cannot be verified again, including under concurrent requests.

### P3.4 — Add the challenge creation endpoint [x]

- [x] Authenticate the site key and validate the requested action.
- [x] Create challenge state and return only public render data.
- [x] Return expiry and a stable error for unavailable or invalid sites.

**Done when:** a registered site can request a renderable challenge and cannot request one for a different site.

---

## Phase 4 — Build the drawing widget

**Depends on:** P3.1 and P3.4.

**Goal:** let users complete a challenge with supported pointing devices.

### P4.1 — Render the challenge canvas [x]

- [x] Draw the target and instructions from public render data.
- [x] Scale the drawing correctly for device-pixel ratio and responsive canvas size.
- [x] Keep the target visible enough to use and subtle enough to require tracing.
- [x] Add clear loading, drawing, submitting, success, and retry states.

**Done when:** the widget displays a challenge without changing its coordinate interpretation when resized.

### P4.2 — Collect pointer traces [x]

- [x] Use Pointer Events for mouse, touch, and stylus.
- [x] Capture the active pointer and handle cancellation or leaving the canvas.
- [x] Record canvas-relative coordinates and elapsed time.
- [x] Bound the number and size of points sent to the server.
- [x] Avoid collecting unrelated page interactions.

**Done when:** a completed stroke produces a bounded trace with consistent coordinates across supported pointer types.

### P4.3 — Add widget recovery and accessibility behavior [~]

- [x] Provide keyboard focus, readable instructions, and announced state changes.
- [x] Handle reset, retry, timeout, and network failure.
- [x] Define an accessible alternative or customer-controlled fallback state.

**Done when:** the widget does not leave users trapped after a failed or interrupted attempt.

**Human testing required before completion:** test the P4.1–P4.3 widget in supported browsers at common zoom and device-pixel-ratio settings; with mouse, touch, and stylus; and with keyboard-only navigation plus supported screen readers. Confirm retry, expiry, unavailable, cancellation, Escape reset, and the customer-provided fallback control keep users out of a trapped state. Record the results again in P10.1 end-to-end release-gate testing.

### P4.4 — Submit traces to the verification endpoint [x]

- [x] Submit challenge ID and trace only.
- [x] Treat the browser response as pending until server verification completes.
- [x] Handle accepted, rejected, expired, consumed, and unavailable outcomes.

**Done when:** the widget never declares verification successful based only on local geometry.

---

## Phase 5 — Validate traces on the server

**Depends on:** P3.1, P3.3, and P4.2.

**Goal:** score trace geometry and interaction characteristics as separate evidence.

### P5.1 — Validate and normalize trace input [x]

- [x] Reject malformed points, out-of-range coordinates, impossible timestamps, and oversized traces.
- [x] Remove duplicate/no-op points and safely simplify excessive data.
- [x] Normalize coordinates to challenge dimensions.
- [x] Resample target and user paths at comparable spacing.

**Done when:** downstream scoring receives bounded, normalized traces and malformed inputs fail safely.

### P5.2 — Implement geometry metrics [x]

- [x] Calculate distance to target segments.
- [x] Calculate target coverage.
- [x] Check path order and start/end tolerance.
- [x] Detect disconnected strokes and large jumps.
- [x] Keep each metric separately inspectable in internal diagnostics.

**Done when:** accurate, partial, offset, reordered, and discontinuous traces produce distinguishable metric results.

### P5.3 — Implement interaction-naturalness metrics [x]

- [x] Calculate duration and pause distribution.
- [x] Detect suspiciously uniform point spacing or movement timing.
- [x] Detect repeated or implausibly identical traces.
- [x] Keep naturalness independent from geometric accuracy.

**Done when:** a high-quality trace can still be represented as low-naturalness without changing its geometry score.

### P5.4 — Define initial trace acceptance policy [x]

- [x] Set provisional thresholds for geometry metrics.
- [x] Define which combinations produce pass, retry, or escalation.
- [x] Treat perfect geometry as one possible signal, never an automatic failure.
- [x] Mark thresholds for calibration with real usability and abuse outcomes.

**Done when:** normal excellent traces can pass while synthetic regularity can raise suspicion when combined with other signals.

### P5.5 — Add trace-validator tests [x]

- [x] Cover accurate, incomplete, offset, reordered, disconnected, duplicate, excessive, and out-of-bounds traces.
- [x] Cover perfect geometry with natural input and perfect geometry with synthetic regularity.
- [x] Make scoring deterministic for fixed challenge and trace inputs.

**Done when:** the validator's expected behavior is captured in repeatable tests.

---

## Phase 6 — Issue and verify tokens

**Depends on:** P0.5, P3.3, and P5.4.

**Goal:** give customer backends a reliable server-verifiable proof of an accepted action.

### P6.1 — Implement token signing [x]

- [x] Sign accepted verification results through an environment-secret Ed25519 provider; validate and load the provider at startup and confirm the active verification key through readiness.
- [x] Include customer/site, action, issue time, expiry, and unique ID.
- [x] Include a key identifier to support key rotation.
- [x] Never return a token after a failed or expired challenge.

**Done when:** tokens are signed, scoped, short-lived, and contain no unnecessary behavioral data.

### P6.2 — Implement token verification [x]

- [x] Verify signature, expiry, issuer/audience, site, and expected action.
- [x] Check single-use consumption state.
- [x] Return a minimal valid/invalid response without exposing internal risk details.
- [x] Bind `/v1/tokens/verify` to the authenticated private server credential's customer, site, and site-ID audience.

**Done when:** a customer backend can verify a token and a wrong-action, expired, or consumed token is rejected.

### P6.3 — Add the server integration helper [x]

- [x] Provide a server-side SDK or copyable examples for token verification.
- [x] Keep private credentials on the server.
- [x] Document how the customer backend binds verification to its pending request.

**Done when:** a customer can verify tokens without trusting browser callbacks.

### P6.4 — Add token security tests [x]

- [x] Cover invalid signature, expired token, wrong site, wrong action, and replay.
- [x] Cover key rotation behavior.
- [x] Verify that retries do not accidentally reuse a successful token.

**Done when:** invalid or replayed tokens never authorize protected actions.

---

## Phase 7 — Add the risk and policy engine

**Depends on:** Phases 2, 5, and 6.

**Goal:** decide when to invoke the owned drawing CAPTCHA.

### P7.1 — Define normalized decision context [x]

- [x] Define action, site, session reference, request counters, recent failures, and available customer signals.
- [x] Reject or ignore unapproved context fields.
- [x] Make absent signals explicit rather than silently inventing values.

**Done when:** risk rules receive a stable, validated context shape.

### P7.2 — Aggregate minimal behavior features [x]

- [x] Collect only the approved browser/session signals from P0.4.
- [x] Convert events to bounded features such as elapsed-time bands or counts.
- [x] Avoid persistent raw event storage by default.
- [x] Apply retention and deletion rules to temporary feature state.

**Done when:** the engine can make an initial decision from summaries without retaining unnecessary raw interactions.

### P7.3 — Implement explainable deterministic rules [x]

- [x] Add initial rules for request velocity, recent failures, session continuity, and action sensitivity.
- [x] Include challenge replay/expiry and trace results when available.
- [x] Keep each rule named and versioned.
- [x] Do not use one behavioral signal as proof of automation.

**Done when:** a decision can be explained internally by a versioned set of rule outcomes.

### P7.4 — Implement action-specific policy mapping [x]

- [x] Map risk bands and action policies to allow, challenge, retry, cooldown, or block.
- [x] Use stricter defaults for sensitive account recovery than low-impact actions.
- [x] Avoid returning scores or rule thresholds to the browser.

**Done when:** equivalent requests under the same policy version yield the same decision.

### P7.5 — Add observe-only mode [x]

- [x] Calculate and record decisions without enforcing them.
- [x] Compare would-have-challenged outcomes with customer action outcomes where provided.
- [x] Make the mode explicit per site/environment.

**Done when:** customers can assess challenge rates and likely friction before enforcement.

### P7.6 — Add risk and policy tests [x]

- [x] Cover low-risk allow, elevated-risk challenge, retry, cooldown, block, and observe-only behavior.
- [x] Cover perfect trace plus natural input and perfect trace plus suspicious regularity.
- [x] Cover missing, stale, and conflicting signals.

**Done when:** policy decisions are reproducible and false-positive guardrails are represented in tests.

### P7.7 — Add the decision endpoint [x]

- [x] Authenticate the public site key and validate the action.
- [x] Evaluate context and select the site/action policy.
- [x] Return the decision and, when needed, challenge information.
- [x] Return only safe public reason categories.

**Done when:** the same integration can proceed without a challenge for low risk and obtain the owned drawing challenge for elevated risk.

---

## Phase 8 — Package the customer integration

**Depends on:** Phases 4, 6, and 7.

**Goal:** let customers integrate the provider and wrapper without writing trigger logic.

### P8.1 — Stabilize the framework-neutral browser API [x]

- [x] Define initialization, protect(action), decision states, events, and error behavior.
- [x] Make it possible to provide a site key without exposing server credentials.
- [x] Document lifecycle cleanup and duplicate initialization behavior.

**Done when:** the core SDK interface is stable enough for a framework adapter.

### P8.2 — Expose the Web Component [x]

- [x] Wrap the drawing widget in a custom element with isolated styles.
- [x] Support configuration through attributes or properties.
- [x] Expose state changes without requiring React.

**Done when:** a plain HTML site can render the policy-selected challenge and expose its non-authoritative UI state through the documented integration. Challenge verification/scoring remains intentionally disabled until the server verification route is enabled; browser state never authorizes the protected action.

### P8.3 — Add optional framework adapter [x]

- [x] Add a React adapter over the stable browser API.
- [x] Avoid duplicating risk, challenge, or verification logic in the adapter.

**Done when:** React users get idiomatic callbacks while behavior matches the framework-neutral SDK. The adapter exposes non-authoritative UI state only; server verification remains required for protected-action authorization.

### P8.4 — Publish integration examples [x]

- [x] Document browser setup and site-key handling.
- [x] Document server token verification for one protected action.
- [x] Explain decision states, retries, and safe failure handling.
- [x] Keep public documentation free of internal scoring thresholds.

**Done when:** a developer can integrate one action from the examples without implementing CAPTCHA-triggering policy. Current examples explicitly keep the protected action unverified while challenge verification/scoring remains disabled.

---

## Phase 9 — Reliability, abuse controls, and operations

**Depends on:** Phases 2, 3, 6, and 7.

**Goal:** protect TraceCAPTCHA endpoints and make outcomes observable.

### P9.1 — Add endpoint rate limits [x]

- [x] Add configurable limits per customer/site and action through the active site/action policy version.
- [x] Add session and network-based controls where appropriate.
- [x] Apply limits separately to decisions, challenge creation, and verification through their authenticated service boundaries.
- [x] Return predictable retry/cooldown behavior.

**Done when:** repeated challenge or verification requests cannot create unbounded work.

### P9.2 — Add idempotency and concurrency protection [x]

- [x] Support idempotency for retryable customer requests through authenticated challenge creation.
- [x] Make challenge consumption and token consumption atomic.
- [x] Handle simultaneous verification requests consistently through existing atomic challenge and token consumption.

**Done when:** duplicate challenge-creation requests replay one result, and races cannot create multiple valid results from one challenge or token.

### P9.3 — Define outage behavior [x]

- [x] Make outage fallback a customer-owned, per-action trusted-application policy; TraceCAPTCHA always reports generic unavailable rather than making a fail-open/fail-closed decision.
- [x] Support controlled customer-initiated retries for transient decision/challenge dependency failures without automatic duplicate requests.
- [x] Never treat an unverifiable token as valid.
- [x] Ensure the browser receives a recoverable `unavailable` error state.

**Done when:** each protected action has documented behavior during API, Redis, or signing-key service failure, while final customer fallback remains outside untrusted browser state.

### P9.4 — Add aggregate observability [x]

- [x] Record decision, challenge, completion, retry, expiry, replay, and best-effort abandonment counts. Browser abandonment is deduplicated per live challenge and cannot change verification eligibility.
- [x] Track challenge completion duration and abandonment without retaining raw traces or identifiers.
- [x] Track false-positive reports and API/dependency health. Authenticated decision and challenge dependency failures increment a generic aggregate-only `dependency_unavailable` bucket; trusted customer backends can record a `false_positive_reported` aggregate for one protected action using a private credential.
- [x] Keep the observability storage boundary free of raw traces and sensitive risk rules.

**Done when:** operators can measure friction, reliability, and abuse without inspecting unnecessary personal data.

### P9.5 — Review accessibility and privacy behavior [~]

- [~] Review keyboard, touch, visible focus, and announced state handling in implementation and unit coverage; P4.3 human browser/accessibility QA remains required.
- [x] Review the customer-controlled alternative/recovery path for users unable to trace.
- [x] Confirm the currently implemented browser collection boundary in public integration docs.
- [x] Confirm documented aggregate-only retention boundary; no raw trace retention is added.

**Done when:** the implemented SDK and service meet the documented collection and recovery behavior.

---

## Phase 10 — MVP release gate

**Depends on:** all required tasks above.

### P10.0 — Build a minimal end-to-end test harness [~]

**Goal:** validate the deployed browser-to-backend verification flow before
claiming production readiness. This is a focused test surface, not a customer
dashboard or a second product interface.

- [x] Choose one dedicated test-frontend hostname before bootstrap. Register
      that exact lowercase hostname as the first site identifier; it must be the
      browser application's origin, never the TraceCAPTCHA API hostname.
- [x] Create one test page that uses only the public site key to request a
      decision, displays the existing framework-neutral component when challenged,
      and renders only safe `allow`, `retry`, `cooldown`, `block`, and
      `unavailable` states.
- [x] Add a minimal trusted test-backend verification handler. Keep the private
      server credential in its server-side secret store; verify and atomically
      consume the returned token for the expected action before showing an
      authorized test outcome.
- [x] Keep the page out of product scope: no customer administration,
      analytics dashboard, real account creation, raw trace persistence, or
      browser-side authorization.
- [x] Show safe harness diagnostics only: widget state, server decision, safe
      reason category, and token-handoff status. Do not expose numerical
      scores, thresholds, detailed trace measurements, raw traces, or policy
      rules in the browser.
- [ ] Use the harness to execute the P4.3, P9.5, and P10.1 human test cases
      across the documented browser, input-device, keyboard, focus, and
      screen-reader scenarios.
- [x] Document the concise manual staging-QA checklist in
      `apps/test-harness/README.md`; it keeps P4.3, P9.5, and P10.1 pending until
      documented human browser/accessibility QA and calibration are complete.
- [x] Manually redeploy the staging API and test harness from `8b2c330` before
      QA. Both services are live; the hosted-browser surface was unavailable to the
      agent, so the human scenarios remain pending.
- [x] Document the test origin, server-side secret ownership, and teardown
      procedure without recording credentials, tokens, raw traces, or user data.

**Done when:** a deployed test frontend and its trusted test backend demonstrate
that a real browser flow can obtain a server-authorized token and that the
backend can verify and consume it. This establishes an integration test surface
for P10.1; it does not complete P4.3, P9.5, P10.1, threshold calibration, or
the production release gate.

### P10.1 — Run end-to-end scenarios [~]

- [ ] Low-risk action is allowed without showing a challenge.
- [ ] Elevated-risk action displays the drawing challenge.
- [ ] Accurate trace is accepted and incomplete trace can retry.
- [ ] Expired, consumed, and replayed challenges are rejected.
- [ ] Accepted token is action-bound and verified by the customer backend.
- [ ] Suspicious regularity can raise risk without automatically failing every perfect trace.
- [ ] API outage follows the configured action policy.
- [ ] Accessibility recovery is reachable.

### P10.2 — Prepare the first release documentation [x]

- [x] Reconcile readme.md, API docs, and SDK examples with the shipped behavior.
- [x] Document supported browsers, integration requirements, and known limits.
- [x] Document customer responsibilities for backend token verification and user notices.

**Release gate:** do not describe the MVP as production-ready until the end-to-end scenarios pass and the known limits are documented.

---

## Current implementation status update

- P9.1 is [x]: the authenticated challenge-verification service applies configured site/action and network rate limits before it consumes a challenge. Its policy migration is applied to the staging PostgreSQL deployment.
- P9.4 is [x]: decision, challenge creation/replay, verification completion/retry/observed-expiry, duration, and best-effort abandonment aggregates are wired. Abandonment is deduplicated per live challenge and is never a verification or policy input.
- P4.3 and P9.5 remain [~] pending documented human browser, device, keyboard, touch/stylus, focus, and screen-reader QA.
- P10.1 remains [~]: server verification now exists, but provisional thresholds require calibration and the human release-gate scenarios remain pending.
- The API runtime remains alive after a successful listener startup; startup-failure cleanup remains contained in the error path. Render deployment configuration and database/site bootstrap remain operational work, not release-gate completion.
- The aggregate-metric migration supplies the composite site/customer uniqueness required by its scoped foreign key; it must be applied with the remaining deployment migrations before metrics are available.
- A server-only one-time bootstrap CLI now creates the first customer, environment, site, allowed web hostname, credential pair, and active version-one policies in one transaction. It remains an operator workflow: it must be run from a trusted environment with an explicitly confirmed configuration and a secure new credential-output file; it is not a browser or HTTP API.
- P10.0 now has a deployed test frontend and trusted verification handler at `https://tracecaptcha-test-harness.onrender.com` in Singapore. Its configured public origin matches that URL, and its browser/site and server credentials are held in the appropriate deployment configuration. It remains a staging QA surface, not a production authorization or release-readiness claim.
- The P10.0 harness now presents safe, non-authoritative diagnostics for browser QA, while the canvas renders a subdued dashed guide and a solid live trace brush. This does not expose scoring internals or complete human QA/calibration.
- Browser pointer collection accepts normal mouse drag movement, whose Pointer Events use `button: -1` after the initial press. The regression test confirms those intermediate coordinates are drawn and included in the submitted trace; human mouse/touch/stylus QA remains pending.

## Current provisional-policy update

- Trace matching now accepts either continuous drawing direction, a small unclosed gap, rounded corners, and a short correction tail when the stroke otherwise follows the full outline.
- Complete-outline coverage is sampled along every target segment, not only at polygon vertices. Repeated outline loops, substantial excursions, incomplete outlines, discontinuities, and direction-changing backtracking remain rejection conditions.
- These are `provisional-v2` staging-calibration changes. They do not complete P4.3, P9.5, or P10.1, and do not authorize production use without documented human browser/accessibility QA and calibration.

## Success measures

- Legitimate users complete challenges quickly and can recover from failure.
- Low-risk users are rarely interrupted.
- Repeated automation cannot reuse an old challenge or token.
- Customer backends verify results independently.
- Challenge, decision, failure, expiry, and abandonment rates are measurable.
- Accessibility failures have a defined recovery path.

## Decisions to resolve before the dependent task begins

Record each decision in notes.md when made:

- exact token format and signing-key rotation process
- default challenge lifetime and retry limits
- default policies for each protected action
- raw event retention period, if raw events are retained at all
- failure behavior during API or Redis outage
- supported native mobile integration boundary
