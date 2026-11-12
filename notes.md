# Project Notes and Agent Work Log

This file tracks meaningful project decisions and implementation work. It is an internal project record, not customer documentation.

## How to record an entry

Each entry should include:

- date
- contributor role, not a personal or agent name
- files or area changed
- what changed
- why it changed
- verification performed
- unresolved follow-up

Do not add agent names, `Co-authored-by` lines, or personal attribution.

## 2026-11-07 — Product direction clarified

- Contributor role: project planning
- Area: product boundary and architecture
- What changed: confirmed that TraceCAPTCHA will use an owned drawing-based CAPTCHA as its provider and add a wrapper/risk engine that decides when to invoke it for customer websites and apps.
- Why: the value is not only the drawing interaction; it is removing repeated CAPTCHA-triggering logic from customer applications while keeping verification server-authoritative.
- Verification: reviewed `project.md` and discussed the distinction between CAPTCHA verification and risk-based invocation.
- Follow-up: define public API contracts and threat model before implementation.

## 2026-11-07 — Documentation structure created

- Contributor role: project planning
- Area: repository documentation
- What changed: added `plan.md`, `architecture.md`, `agent.md`, `techstack.md`, `notes.md`, and `readme.md`.
- Why: separate execution planning, system design, agent rules, technology choices, internal history, and public documentation.
- Verification: documentation-only change; no project services started and no commit created.
- Follow-up: reconcile any remaining differences between the original `project.md` and the wrapper architecture before coding.

## 2026-11-07 — Canonical project specification rewritten

- Contributor role: project planning
- Area: product specification
- What changed: rewrote `project.md` around the current product decision: an owned drawing CAPTCHA provider plus a risk-based wrapper. Added API contracts, risk-engine behavior, perfect-trace handling, data model, trust boundaries, privacy, accessibility, operations, testing, and delivery criteria.
- Why: the previous specification focused primarily on a standalone drawing CAPTCHA and did not fully define when the wrapper invokes it or how customer backends verify the result.
- Verification: checked that the rewritten document is present, UTF-8-readable by repository tools, and contains no legacy drawing-only heading. No services started and no commit created.
- Follow-up: review the API contract and threat model before implementation.

## 2026-11-07 — Implementation plan decomposed into tasks

- Contributor role: project planning
- Area: delivery planning
- What changed: replaced phase-level summaries in `plan.md` with sequenced, dependency-aware tasks and acceptance checks spanning contracts, service foundation, site identity, challenge generation, widget, trace validation, tokens, risk policies, SDK integration, and operational readiness.
- Why: smaller tasks make the implementation order easier to follow and each increment easier to review.
- Verification: inspected the updated plan and confirmed task IDs, dependencies, and completion checks are present. No implementation tests or services were run.
- Follow-up: use the task IDs when beginning implementation and record progress in this log.

## 2026-11-07 — Service foundation started

- Contributor role: implementation
- Area: P1.1 through P1.4
- What changed: created the TypeScript pnpm workspace with API, shared-type, CAPTCHA-engine, risk-engine, and browser-SDK packages. Added strict TypeScript settings, API configuration validation, structured error handling, and liveness/readiness endpoints.
- Why: this establishes one shared contract surface and a minimal API process before building challenge and risk behavior.
- Verification: inspected the workspace structure. Dependency installation and type checking could not complete because package retrieval is blocked in the current environment; no modules or lockfile were created.
- Follow-up: install dependencies in an environment with package registry access, then run the workspace type check before marking P1.1 through P1.4 complete.

## 2026-11-07 — Initial OpenAPI contract added

- Contributor role: implementation
- Area: P0.2
- What changed: added `openapi.yaml` with versioned decision, challenge, challenge-verification, and token-verification endpoints; public site-key and server-secret-key authentication; response schemas; and bounded trace input contracts. Updated `project.md` so its examples use the same header-based authentication.
- Why: browser and server packages now have one contract to implement against, with private token verification kept server-side.
- Verification: checked the endpoint names and authentication model against the project specification. Full OpenAPI validation is pending dependency installation.
- Follow-up: review the contract before finalizing P0.2, then implement endpoint handlers from the shared schemas.

## 2026-11-07 — Project coding context initialized

- Contributor role: project setup
- Area: coding-agent onboarding
- What changed: stored durable project context covering architecture, technology choices, commands, coding conventions, completion checks, API structure, and workspace package boundaries.
- Why: future coding work can follow the established server-authority, privacy, token, and package rules without rediscovering them.
- Verification: onboarding context was written for the project. The Serena memory reference graph can be checked from the project root with `serena memories check`.
- Follow-up: continue implementation from the in-progress P0.2 and P1 tasks after dependencies are available.

## 2026-11-07 — Dependencies installed and workspace build verified

- Contributor role: implementation
- Area: P1.1
- What changed: dependencies were installed from the user's local PowerShell session, producing pnpm-lock.yaml and node_modules. Updated the root type-check command to build shared types before checking dependent workspace packages; removed the source-path workaround because it conflicted with package root directories.
- Why: workspace packages must resolve the published shared-type declaration entry during independent type checks.
- Verification: `pnpm typecheck` passed for all five TypeScript packages; `pnpm build` passed for all five packages.
- Follow-up: implement the versioned API endpoint handlers and domain schemas, then complete the remaining API-foundation tasks.

## 2026-11-07 — Versioned route and request-schema boundary completed

- Contributor role: implementation
- Area: P0.2 and P1.3 API contract alignment
- What changed: registered the four documented `/v1` POST route shapes, added strict Zod schemas for their headers, path parameters, and bodies, and expanded shared TypeScript contracts to match `openapi.yaml`. The token field is now redacted from API logs. Valid contract-shaped requests currently return a deliberate `not_implemented` response after validation.
- Why: validates untrusted browser and server input at the API boundary while keeping authentication, policy decisions, challenge state, token handling, Redis, and PostgreSQL behavior out of this scoped increment.
- Verification: `pnpm typecheck`, `pnpm build`, and an in-memory Fastify route check passed. The route check covered the deliberate `501` placeholder, a missing site key returning `401`, and an out-of-bounds trace point returning `400`. No services were started.
- Follow-up: define the P0.2 versioning compatibility rules, then implement site identity and authenticated behavior before enabling any contract route to perform its domain operation.

## 2026-11-10 — API v1 compatibility policy defined

- Contributor role: implementation
- Area: P0.2 public API contract
- What changed: documented that the URL major version is the compatibility boundary; `/v1` permits additive endpoints and optional fields, and clients must ignore unrecognized response fields. Breaking changes require a new URL major version, while deprecated `/v1` behavior remains documented until that version is available.
- Why: gives browser SDKs and server integrations a stable contract while allowing non-breaking API evolution.
- Verification: reviewed the policy against the current `/v1` OpenAPI contract. No services were started.
- Follow-up: begin site identity and key authentication before changing any placeholder route into an operating API endpoint.

## 2026-11-10 — API runtime and configuration-loading audit completed

- Contributor role: implementation
- Area: P1.2 API runtime and configuration loading
- What changed: audited the existing API runtime and marked P1.2 complete in `plan.md`. The API builds its Fastify application, registers health and `/v1` routes, validates the supported environment values before calling `listen`, and keeps runtime configuration internal. Structured logging redacts authorization, secret-key, and token fields.
- Why: all concrete P1.2 requirements were already implemented. No credential-bearing runtime configuration can be added safely before Phase 2 defines customer and site credentials; adding it now would prematurely introduce authentication behavior.
- Verification: inspected the API entry point, configuration schema, server setup, route registration, environment example, and logger redaction configuration. No services, databases, browsers, or listeners were started.
- Follow-up: P1.4 remains in progress until readiness reflects real required dependencies; add customer and site credential configuration only with Phase 2 identity work.

## 2026-11-10 — Health and readiness checks completed

- Contributor role: implementation
- Area: P1.4 health and readiness
- What changed: added internal readiness-check hooks to the API server. `/health/live` reports only process liveness. `/health/ready` runs all registered required checks and returns either `200 { "status": "ready" }` or the generic `503 { "status": "unavailable" }`; it exposes neither dependency identity nor infrastructure details.
- Why: deployment monitoring can now distinguish a running API process from one that cannot accept verification traffic, without introducing Redis or PostgreSQL behavior before those dependencies are part of the service.
- Verification: `pnpm typecheck` passed, `pnpm build` passed, and in-memory Fastify injection checks confirmed live `200`, ready `200`, and a failed readiness check returning `503`. No services, databases, browsers, ports, or project listeners were started.
- Follow-up: register concrete Redis, PostgreSQL, and signing-service checks only when those dependencies are introduced by their respective phases.

## 2026-11-10 — Protected actions and outage policy defined

- Contributor role: implementation
- Area: P0.1 protected-action and decision semantics
- What changed: defined `signup`, `login`, `password_reset`, and `otp_request` as the initial action identifiers; documented customer-facing meanings for all five decisions; added the generic `503 service_unavailable` response to each public API operation in `openapi.yaml`.
- Why: TraceCAPTCHA reports its own unavailability without making a protected-action authorization decision. Each customer application owns an explicit fallback policy, while unavailable or unverifiable tokens remain invalid.
- Verification: reviewed the project specification, architecture, plan, and OpenAPI contract for consistent action IDs, decision meanings, and outage behavior. No services, databases, browsers, ports, or listeners were started.
- Follow-up: implement `service_unavailable` handling only when a later phase adds a dependency that can fail; do not change the deliberate `501` placeholders before their respective domain behavior exists.

## 2026-11-10 — Security trust boundaries defined

- Contributor role: implementation
- Area: P0.3 security and trust boundaries
- What changed: documented the exact browser/server authority boundary, challenge expiry and first-submission consumption rules, retry requirement for a fresh challenge, token replay prevention, future idempotency semantics, key responsibilities, and threat model for challenge creation, trace submission, and token verification.
- Why: a failed trace now has an unambiguous recovery path without allowing repeated probing of the same challenge; no browser-provided value can authorize a protected action.
- Verification: reviewed the security model and architecture against the current request schemas, API contract, and the approved fresh-challenge-on-retry rule. No services, databases, browsers, ports, or listeners were started.
- Follow-up: P0.5 must choose the token format, concrete claims, signing-key storage, and rotation process before token behavior is implemented; P3, P6, and P9 must enforce the documented rules.

## 2026-11-10 — Initial data collection and retention policy defined

- Contributor role: implementation
- Area: P0.4 collection and retention
- What changed: limited first-release browser input to the site key, action, optional session or attempt reference, and challenge trace; excluded passwords, raw keystrokes, typed content, page contents, device fingerprints, and unrelated page interaction. Raw traces are discarded after synchronous scoring; active challenge state expires in Redis with the challenge; aggregate outcomes and non-secret security audit metadata retain for 90 days.
- Why: the initial risk policy needs only protected-action context and server-derived challenge results, minimizing stored behavioral data while leaving enough aggregate and security information to operate the service.
- Verification: reviewed the collection boundary, storage roles, existing API fields, and retention requirements across the project specification and architecture. No services, databases, browsers, ports, or listeners were started.
- Follow-up: implement the documented deletion behavior with the challenge, risk, observability, and audit storage work; reassess privacy documentation before adding browser signals or diagnostic trace retention.

## 2026-11-10 — Verification token and signing-key policy defined

- Contributor role: implementation
- Area: P0.5 token claims and key lifecycle
- What changed: specified compact Ed25519-signed JWT/JWS verification tokens with fixed `EdDSA` algorithm and explicit type, the required issuer/audience/time/identity/action/challenge claims, five-minute expiry, atomic `jti` consumption, and non-consuming diagnostic checks. Private signing keys are managed outside PostgreSQL; metadata uses `kid` lifecycle records. Active keys rotate every 90 days, retiring public keys remain for 24 hours, and suspected-compromised keys are revoked immediately.
- Why: creates an interoperable, scoped token that does not carry behavioral or personal data and has a defined replay and key-rotation model before token implementation begins.
- Verification: reviewed the token profile against JWT best practices and EdDSA JOSE support, the existing secret-key verification endpoint, and the P0.3 replay rule. No services, databases, browsers, ports, or listeners were started.
- Follow-up: Phase 6 must implement this profile with a vetted JOSE library, managed-key integration, strict fixed-algorithm validation, atomic `jti` consumption, and rotation/revocation tests.

## 2026-11-10 — Customer, environment, and site identity schema added

- Contributor role: implementation
- Area: P2.1 identity records
- What changed: added shared customer, environment, site, and site-identifier types plus an initial PostgreSQL migration. The schema requires every site to belong to one customer and that customer's environment, supports web hostnames and Android/iOS application identifiers, and indexes active customer/site lookup paths. Identifier kind/value pairs are globally unique, preventing two sites from claiming the same allowed origin or app identifier.
- Why: establishes durable registration boundaries before public or private credentials are issued. The migration is database-agnostic SQL and does not add runtime PostgreSQL connectivity or authorize any request.
- Verification: reviewed the foreign keys, uniqueness constraints, status constraints, and lookup indexes against the P2.1 identity requirements. `pnpm typecheck`, `pnpm build`, and the changed-file Prettier check passed. No database migration was applied and no services, databases, browsers, ports, or listeners were started.
- Follow-up: P2.2 must add credential issuance, safe key storage, revocation, and runtime lookup before these records are used to authenticate API requests.

## 2026-11-10 — Site credential lifecycle completed

- Contributor role: implementation
- Area: P2.2 site credentials
- What changed: added a second PostgreSQL migration for public site keys and private server credentials. Credential records retain only a versioned scrypt hash, opaque key ID, site binding, optional non-secret label, and lifecycle timestamps. Added an API-local issuer and validator with distinct `tc_site` and `tc_server` formats, constant-time hash comparison, and a database-agnostic key-ID lookup interface. Added shared credential metadata types and focused tests for credential-class separation, tampering, retirement expiry, and revocation.
- Why: browser-visible site keys can now identify a registered site without being interchangeable with private server credentials. Rotation can atomically promote a replacement while the former key is time-bounded as retiring; revoked keys are rejected immediately. Plaintext credentials are returned only by issuance and are neither persisted nor logged.
- Verification: `pnpm typecheck`, `pnpm build`, and `pnpm --filter @tracecaptcha/api exec tsx --test src/credentials.test.ts` passed. Targeted Prettier formatting was applied to the changed TypeScript files. The repository-wide `pnpm format:check` remains blocked by pre-existing unformatted `.serena/memories` files; SQL is not covered because this Prettier configuration has no SQL parser. No services, databases, browsers, ports, or project listeners were started; no migration was applied.
- Follow-up: add the PostgreSQL adapter for `SiteCredentialLookup`, origin/app-identifier binding, and route authentication only when the relevant later runtime work introduces PostgreSQL configuration and dependency readiness checks. Keep all current valid `/v1` operations as `501` placeholders until their domain behavior is implemented.

## 2026-11-10 — Initial site action policies completed

- Contributor role: implementation
- Area: P2.3 site/action policy configuration
- What changed: added a versioned site/action-policy migration, shared policy types, and server-side provisioning defaults. Each policy version contains the decision for low, elevated, high, and severe risk; each site/action pair can have only one active version while superseded versions retain their timestamped history. The approved initial defaults allow low-risk signup/login, challenge elevated signup/login plus all password-reset and OTP requests, cool down high risk, and block severe risk.
- Why: deterministic, explainable configuration must exist before the future policy engine maps its risk bands to decisions. Password reset and OTP requests receive more initial friction because they are sensitive recovery or cost-bearing flows.
- Verification: `pnpm typecheck`, `pnpm build`, and `pnpm --filter @tracecaptcha/api exec tsx --test src/policies.test.ts` passed. Targeted Prettier formatting and checks passed. No services, databases, browsers, ports, or project listeners were started; no migration was applied.
- Follow-up: P7.4 should add runtime policy lookup and risk-band-to-decision selection through a PostgreSQL adapter, preserving the stored policy version on each decision record. Do not change the current `/v1` placeholders before their domain dependencies are introduced.

## 2026-11-10 — Challenge-state and public-render boundary completed

- Contributor role: implementation
- Area: P3.1 challenge and render-data types
- What changed: added semantic challenge ID/type types and defined server-only challenge state with customer/site/action binding, optional session reference, type, difficulty, seed, canonical normalized target, creation/expiry times, and lifecycle status. Added an explicit projection to the existing public challenge response, which exposes only the challenge ID, action, expiry, and render data needed by the browser. Added a boundary test confirming the private binding, seed, canonical target, and state are omitted.
- Why: the browser must render the visible target but must not receive the authoritative challenge representation or server-state data used for scoring, expiry, or single-use enforcement.
- Verification: `pnpm typecheck`, `pnpm build`, and `pnpm --filter @tracecaptcha/api exec tsx --test src/challenge-state.test.ts` passed. Targeted Prettier formatting and checks passed. No services, databases, browsers, ports, or project listeners were started.
- Follow-up: P3.2 should generate the first bounded polygon family and its render projection from a cryptographically secure seed. P3.3 will add Redis-backed expiry and atomic consumption; no lifetime value or runtime challenge behavior was selected here.

## 2026-11-10 — Seeded polygon challenge generator completed

- Contributor role: implementation
- Area: P3.2 polygon generation
- What changed: added a deterministic regular-polygon generator to the CAPTCHA engine and an API-only wrapper that creates a fresh 256-bit base64url seed using Node's cryptographic random source. The generator uses the seed to vary four to six sides, size, position, and rotation while keeping every point inside the OpenAPI-supported 120–1024 pixel canvas bounds. It returns a private normalized canonical path and public pixel render path. The API now declares the internal CAPTCHA-engine dependency, and root typecheck builds that dependency before checking the API so declaration resolution is current.
- Why: one bounded, repeatable challenge family is sufficient for the MVP and gives later server-side validation stable canonical geometry. Fresh cryptographic seeds make challenge instances unpredictable without introducing browser-side authority or a runtime endpoint.
- Verification: `pnpm install --offline --ignore-scripts` refreshed the new workspace link without downloads or lifecycle scripts. `pnpm typecheck`, `pnpm build`, and `pnpm --filter @tracecaptcha/api exec tsx --test src/challenge-generator.test.ts` passed; the focused test covers seed size, variation, deterministic regeneration, and canvas bounds. Targeted Prettier formatting/checks passed. No services, databases, browsers, ports, or project listeners were started.
- Follow-up: P3.3 needs the still-unresolved default challenge lifetime before adding Redis-backed state, expiry, and atomic first-submission consumption. P3.4 must not expose the generator through `/v1` until site authentication and the state store exist.

## 2026-11-10 — Redis challenge expiry and consumption completed

- Contributor role: implementation
- Area: P3.3 challenge-state storage
- What changed: selected a two-minute initial challenge lifetime and documented it in the project specification. Added the official Redis client dependency and a Redis challenge-store adapter that stores private challenge state under a TTL-bound key using `SET NX PX`, then atomically consumes a first valid submission using `GETDEL`. The store returns the consumed state only in memory for later scoring; subsequent consumers receive no state. It independently checks the stored expiry so a stale key cannot be accepted if TTL cleanup is delayed.
- Why: Redis is the short-lived authoritative store for active challenge state, expiry, and single-use enforcement. Atomic deletion prevents concurrent submissions from reusing a challenge, while the server-side clock remains authoritative over browser timing.
- Verification: `pnpm typecheck`, `pnpm build`, and `pnpm --filter @tracecaptcha/api exec tsx --test src/challenge-store.test.ts` passed. The focused tests cover the two-minute deadline, duplicate storage rejection, concurrent consumption, binding preservation, and expiry. Targeted Prettier formatting/checks passed. No Redis service, database, browser, port, listener, or project service was started, so live Redis integration was intentionally not run.
- Follow-up: P3.4 must construct a configured Redis client, register its readiness check, authenticate the site, create the generated state, and expose the public projection from `/v1/challenges`. Keep token and trace-verification behavior out of that endpoint.

## 2026-11-11 — Browser-bound challenge creation completed

- Contributor role: implementation
- Area: P3.4 challenge creation endpoint
- What changed: activated `POST /v1/challenges` for browser integrations. The endpoint validates a public site credential against active customer, environment, and site records in PostgreSQL; requires the browser `Origin` hostname to equal a registered `web_hostname`; creates a seeded polygon state in Redis; and returns only the public challenge projection with a two-minute expiry. It returns generic `401 invalid_site_key` for invalid, revoked, inactive, missing-origin, or cross-origin requests and generic retryable `503 service_unavailable` for PostgreSQL or Redis failures. Added PostgreSQL/Redis runtime configuration, startup dependency checks, readiness checks, browser preflight handling, OpenAPI `Origin` documentation, and in-memory route tests. Added the PostgreSQL client dependency.
- Why: a public site key is observable in browser code and cannot itself prove request origin. Origin-to-registered-hostname binding prevents a copied browser key from creating challenges for a site from an unrelated web origin. Private seed, canonical target, customer/site binding, and state remain in server storage; the browser receives only the render payload.
- Important future change: Android and iOS site identifiers are intentionally rejected by this endpoint. They must remain disabled until a native attestation design is defined and implemented, including platform-issued attestation validation, nonce binding, replay handling, failure behavior, and privacy review. Do not treat a caller-provided package or bundle ID as equivalent to browser `Origin` validation.
- Verification: API TypeScript no-emit check passed; a full workspace TypeScript build was run directly with the installed compiler; focused in-memory route, credential, and challenge-store tests passed (9 tests). Targeted Prettier formatting/checks passed. `pnpm typecheck` could not run because pnpm's existing ignored-build policy rejects the `esbuild` postinstall before running scripts; no policy was changed. No Redis service, PostgreSQL database, browser, port, listener, migration, or project service was started, so live dependency integration remains unrun.
- Follow-up: P4.1 may render the public challenge contract. Before production deployment, apply migrations and validate the configured PostgreSQL/Redis connection lifecycle and readiness behavior against managed infrastructure.

## 2026-11-11 — Responsive browser challenge rendering completed

- Contributor role: implementation
- Area: P4.1 browser canvas rendering
- What changed: added a framework-neutral canvas renderer in the browser SDK. It validates public polygon render data, renders the target with responsive letterboxing and device-pixel-ratio backing resolution, observes size changes, exposes the inverse client-to-challenge coordinate mapping for the future pointer collector, and provides visual loading, drawing, submitting, success, and retry states. Added pure tests proving server coordinate interpretation remains stable across differently sized viewports.
- Why: the browser must render only the server-provided public path while retaining one consistent coordinate system for the server-issued canvas and future trace points. The renderer has no scoring, token, or authorization behavior.
- Verification: browser SDK TypeScript no-emit check and the focused DOM-free layout tests passed. A full workspace TypeScript build using the installed compiler passed. Targeted Prettier formatting/checks passed. Browser visual testing was intentionally not run because the project rules prohibit starting browsers for this task.
- Follow-up: P4.2 should add bounded Pointer Events collection using `toChallengePoint` so pointer coordinates retain the server challenge canvas scale. P4.3 must add accessibility semantics and recovery behavior; current status text is visual-only.

## 2026-11-11 — Bounded Pointer Events trace collection completed

- Contributor role: implementation
- Area: P4.2 browser trace collection
- What changed: added a single-active-pointer collector to the browser canvas renderer. It supports mouse, touch, and stylus Pointer Events; uses canvas pointer capture; maps only the active canvas pointer through the resize-stable server coordinate transform; samples coalesced events; records elapsed monotonic time; and emits a trace only after at least two points. Traces are bounded at 2,000 points and 120 seconds to match the API schema, while cancellation, pointer departure, capture loss, and duration overflow discard the partial trace.
- Why: the browser must collect only the short-lived trace needed for the active challenge, with no keystrokes or unrelated page interactions. Local bounds are an efficiency and UX guardrail; the API continues to treat every submitted coordinate and timestamp as untrusted.
- Verification: browser SDK TypeScript no-emit check and four DOM-free layout/collector tests passed. A full workspace TypeScript build using the installed compiler passed. Targeted Prettier formatting/checks passed. No browser was started, so live mouse/touch/stylus event QA remains intentionally unrun.
- Follow-up: P4.3 must add keyboard focus, ARIA live state, reset/retry/timeout/network recovery, and a documented alternative path. P4.4 should send only the emitted trace plus challenge ID to the server and never treat local completion as verification success.

## 2026-11-11 — Widget recovery and accessibility implementation awaiting human QA

- Contributor role: implementation
- Area: P4.3 browser recovery and accessibility
- What changed: added focusable canvas semantics, readable instructions, polite live status announcements, Escape reset, server-expiry timing support, retry/expired/unavailable recovery states, and an optional customer-owned fallback button callback. Recovery clears partial traces and never declares local drawing success to be verification success. The fallback remains customer-controlled; TraceCAPTCHA does not silently authorize a protected action when drawing is unavailable or inaccessible.
- Why: a drawing widget needs a visible exit and recovery path, while browser state must remain a user-interface signal rather than a security result.
- Verification: browser SDK typecheck, five DOM-free layout/collector/recovery tests, full workspace TypeScript build, and targeted Prettier checks passed. No browser was started.
- Human testing required to complete P4.3: test the P4.1–P4.3 widget in supported browsers at common zoom and device-pixel-ratio settings, using mouse, touch, and stylus; then test keyboard-only focus, Escape reset, status announcements with supported screen readers, and customer fallback-button reachability. Exercise retry, expiry, unavailable, cancellation, and slow or interrupted flows; confirm no flow traps the user or treats browser UI success as authorization. Record results under P4.3 and repeat the applicable scenarios in P10.1 end-to-end release-gate testing before describing the widget as complete or production-ready.
- Follow-up: complete the listed human QA before changing P4.3 to complete. P4.4 should submit only challenge ID and emitted trace, use `setExpiry` with the server response, and map verification outcomes to recovery states without trusting local geometry.

## 2026-11-11 — Browser trace submission boundary completed

- Contributor role: implementation
- Area: P4.4 browser verification submission
- What changed: added a browser verification client that derives the required `action` only from the server-issued challenge binding, posts that action and the emitted trace to the versioned verification endpoint, and keeps the widget in `submitting` until a server response arrives. It exposes accepted, retry, rejected, expired, consumed, and unavailable outcomes, ignores unknown additive response fields, and maps each outcome to a non-authoritative widget state. A returned verification token remains data for the customer backend, not a browser authorization result.
- Why: the browser must never score its own trace or turn local drawing completion into verification success. The public contract currently requires `action` in the request body, so the SDK uses the challenge's original action rather than exposing a caller-controlled override.
- Verification: eight focused browser SDK tests passed, covering request shape, pending-to-server outcome transitions, accepted/retry/rejected/expired/consumed/unavailable handling, and malformed successful responses. Browser SDK typecheck, direct TypeScript builds for every workspace package, and targeted Prettier checks passed. No browser or service was started.
- Follow-up: P5 must replace the verification endpoint placeholder with server-side input validation, atomic state consumption, scoring, and policy behavior. A retry result must be followed by a new server-issued challenge; neither this SDK layer nor its `success` widget state authorizes the customer action.

## 2026-11-11 — Server trace validation and normalization completed

- Contributor role: implementation
- Area: P5.1 trace input validation and normalization
- What changed: added a server-only normalizer that independently validates every untrusted point against the stored challenge canvas, requires a zero-based non-decreasing integer timestamp sequence within 120 seconds, rejects malformed, degenerate, out-of-canvas, and oversized traces, converts valid coordinates into the canonical unit square, removes no-op movement, and deterministically resamples both the submitted trace and the closed canonical target to 128 arc-length points. The API schema now rejects non-zero initial timestamps and decreasing sequences at the request boundary, and the OpenAPI trace-point contract documents that ordering rule.
- Why: later geometry and naturalness work receives bounded, canvas-relative server data rather than browser claims, without exposing canonical targets, scoring thresholds, or enabling verification runtime behavior.
- Verification: focused TypeScript tests passed, covering normalization, duplicate removal, target closure, malformed/out-of-range/oversized data, impossible timestamps at both normalizer and request-schema boundaries, degenerate movement, and maximum-sized traces. API TypeScript no-emit and emitting builds plus targeted Prettier checks passed. No services, databases, browsers, ports, or listeners were started.
- Follow-up: P5.2 must calculate geometry metrics from these normalized paths. Keep the verification endpoint as a `501` placeholder until its required atomic challenge-consumption and policy behavior are implemented. P5.3 should retain only the bounded timing evidence needed for naturalness calculations and discard raw points after synchronous scoring.

## 2026-11-11 — Server geometry diagnostics completed

- Contributor role: implementation
- Area: P5.2 trace geometry metrics
- What changed: added server-only geometry diagnostics for mean and maximum trace-to-target distance, mean target-to-trace distance, target coverage, canonical path-order consistency, start/end proximity, and discontinuity metrics. The normalizer now retains only the already bounded, deduplicated normalized source trace during the current verification calculation so geometry can identify an off-target large movement that 128-point arc-length resampling would otherwise smooth out. A large jump is recorded only when its midpoint leaves the target, so sparse legitimate movement along a polygon edge is not mislabeled as a discontinuity.
- Why: scoring needs distinct, inspectable geometry evidence for accurate, incomplete, offset, reversed, and disconnected traces before any acceptance policy is selected. The diagnostic resolutions remain API-local and do not accept, reject, issue tokens, or expose scores to browsers.
- Verification: focused P5.1/P5.2 TypeScript tests passed (7 tests), covering an accurate ordered trace plus incomplete, offset, reordered, disconnected, malformed, out-of-range, oversized, timestamp-invalid, degenerate, and maximum-sized inputs. API TypeScript no-emit and emitting builds plus targeted formatting checks passed. No services, databases, browsers, ports, or listeners were started.
- Follow-up: P5.3 should add timing and regularity metrics separately from these geometry metrics. P5.4 must define and calibrate acceptance policy; do not treat any one diagnostic, including perfect geometry, as an automatic verdict.

## 2026-11-11 — Interaction-naturalness diagnostics completed

- Contributor role: implementation
- Area: P5.3 interaction-naturalness metrics
- What changed: added server-only duration, median/max inter-event interval, longest-pause share, timestamp-regularity, and point-spacing-regularity diagnostics. Uniform timing and spacing are represented as explicit internal signals only when sufficient samples exist. Added a caller-supplied effective-identity comparison helper for traces already available during the current flow; it creates no persistent signature, fingerprint, or trace store.
- Why: interaction naturalness is independent evidence from geometry. An exact path with synthetic regularity can now be represented separately from an equally accurate but irregular trace, without changing geometry metrics or authorizing/rejecting an action.
- Verification: focused P5.1–P5.3 TypeScript tests passed (10 tests), covering geometry separation, uniform versus irregular timing/spacing, pause summaries, caller-provided identical-trace comparison, and prior input/geometry cases. API TypeScript no-emit and emitting builds plus targeted formatting checks passed. No services, databases, browsers, ports, or listeners were started.
- Follow-up: P5.4 must define provisional, calibration-marked acceptance policy using combinations of geometry and naturalness diagnostics. Any future cross-request comparison must have explicit bounded-state, retention, and privacy design; do not persist raw traces or use a single naturalness signal as a verdict.

## 2026-11-11 — Provisional trace acceptance policy completed

- Contributor role: implementation
- Area: P5.4 trace acceptance policy
- What changed: added the internal `provisional-v1` trace assessment policy. It produces `pass`, `retry`, or `escalate` from separately inspectable geometry reasons and naturalness signals, with every threshold explicitly marked calibration-required. Geometry failures retry; one regularity signal alone remains non-decisive; combined highly uniform timing and spacing retry; and only that combined regularity plus a caller-provided effectively identical prior trace escalates. Perfect geometry alone never fails.
- Why: the first policy needs a clear, conservative behavior before usability/abuse calibration while avoiding a hidden single-signal hard fail. This is an internal assessment only and does not map to public API decisions, issue tokens, or enable a verification route.
- Verification: focused P5.1–P5.4 TypeScript tests passed (14 tests), covering accurate/incomplete/offset/reordered/disconnected geometry, naturalness separation and repeat comparison, excellent pass, geometry retry, single-signal guardrail, combined regularity retry, and repeated-combined escalation. API TypeScript no-emit and emitting builds plus targeted formatting checks passed. No services, databases, browsers, ports, or listeners were started.
- Follow-up: P5.5 should consolidate the trace-validator cases into the planned deterministic coverage suite. Any later route integration must atomically consume a syntactically valid challenge before scoring and map assessment outcomes to the documented public policy without exposing metrics or thresholds.

## 2026-11-11 — Trace-validator coverage suite completed

- Contributor role: implementation
- Area: P5.5 trace-validator tests
- What changed: added a deterministic consolidated validator test that drives a fixed server challenge through normalization, geometry diagnostics, naturalness diagnostics, and provisional assessment. It explicitly covers accurate, incomplete, offset, reordered, disconnected, duplicate, excessive, and out-of-bounds traces; verifies that perfect geometry remains separate from naturalness; and proves repeatable assessment output for fixed input.
- Why: P5 needs repeatable evidence that input handling and diagnostic outcomes are stable before any route consumes challenges or maps assessments to a customer-visible result.
- Verification: focused P5.1–P5.5 TypeScript suite passed (16 tests). API TypeScript no-emit and emitting builds plus targeted formatting checks passed. No services, databases, browsers, ports, or listeners were started.
- Follow-up: Phase 5 is now complete as an internal validation/scoring component. Before enabling `/v1/challenges/{challengeId}/verify`, define the route-level authenticated binding checks and atomic syntactically-valid challenge consumption, then map this internal assessment through the policy/token work without exposing diagnostic scores or thresholds.

## 2026-11-11 — Verification-token signing boundary implemented, pending managed-key wiring

- Contributor role: implementation
- Area: P6.1 token signing
- What changed: added the vetted `jose` library and an internal Ed25519 `EdDSA` compact-JWT signer. It fixes the protected header to `alg: EdDSA` and `typ: tracecaptcha-verification+jwt`, includes `kid`, issuer, audience, issue/expiry time, `jti`, customer, site, action, and challenge claims, and issues five-minute tokens only for an unexpired challenge passed to the accepted-only operation. A key-provider interface keeps private key material outside PostgreSQL and application records; unavailable signing material produces an internal unavailable error. Focused tests verify the signed header and claims with an ephemeral test key, plus expired-challenge and unavailable-key guards.
- Why: token construction now follows the approved cryptographic profile without exposing behavioral data, trace points, scores, private keys, or a browser authorization path.
- Verification: focused token-signing TypeScript tests passed (2 tests). API TypeScript no-emit and emitting builds plus targeted formatting checks passed. No services, databases, browsers, ports, or listeners were started. The `jose` dependency was installed with lifecycle scripts disabled after the normal restricted install could not reach the registry.
- Follow-up: P6.1 remains in progress until a production managed KMS or secrets-provider adapter is selected and wired into configuration/readiness checks. P6.2 must validate fixed algorithm/type and all required claims, then atomically consume `jti` values for final authorization. Do not enable token issuance from `/verify` until the authenticated challenge-consumption flow is implemented.

## 2026-11-11 — Verification-token verifier and atomic consumption component implemented

- Contributor role: implementation
- Area: P6.2 token verification
- What changed: added a server-only verifier that accepts only an exact `EdDSA`/`tracecaptcha-verification+jwt` protected header with `kid`, resolves a public key through an external provider, verifies signature, issuer, audience, expiry, issue time, customer, site, action, challenge ID, and `jti`, and returns only minimal valid/invalid results. Added a Redis `SET NX PX` consumption-store adapter that records only the `jti` until token expiry, so final authorization verification is atomic and replay fails. Signature/key-store outages remain distinct internal unavailable errors for later generic `503` mapping.
- Why: a token cannot authorize an action unless it has the fixed cryptographic profile and exact server-provided scope. Validation happens before consumption, so an action/site mismatch does not burn an otherwise valid token.
- Verification: focused token signing/verification TypeScript tests passed (5 tests), covering claim/header verification, atomic replay rejection, scope-mismatch non-consumption, invalid signature, expiry, signing-key unavailability, and expired-challenge signing rejection. API TypeScript no-emit and emitting builds plus targeted formatting checks passed. No services, databases, browsers, ports, or listeners were started.
- Follow-up: P6.2 remains in integration progress until the production public-key provider, private server-credential authentication, Redis adapter, and secret-key verification endpoint are wired. P6.3 should provide customer-facing server integration guidance only after that secure path exists; do not expose detailed token failure reasons.

## 2026-11-11 — Google Cloud KMS selected for managed verification-token keys

- Contributor role: implementation
- Area: P6.1 managed key provider
- What changed: selected Google Cloud KMS `EC_SIGN_ED25519` for the managed signing-key path and added adapters that submit the compact-JWS signing input to one configured CryptoKeyVersion, retrieve mapped active/retiring public keys by `kid`, and import only public key material for local verification. Refactored the signer so its provider performs signatures rather than returning a private key. Added the official Google KMS Node.js client and a focused adapter test that verifies a KMS-produced signature through the normal token verifier.
- Why: the Cloud KMS Ed25519 operation matches the fixed `EdDSA` token profile while keeping the private key outside the TraceCAPTCHA process. The public-key mapping supports key rotation without distributing signing material.
- Verification: focused Google KMS plus token signing/verification TypeScript tests passed (6 tests). API TypeScript no-emit and emitting builds plus targeted formatting checks passed. No live Google Cloud connection, services, databases, browsers, ports, or listeners were started.
- Follow-up: before runtime wiring, create an `ASYMMETRIC_SIGN` Cloud KMS key with `EC_SIGN_ED25519`, identify its full CryptoKeyVersion resource name and internal `kid`, grant the API service account `cloudkms.cryptoKeyVersions.useToSign` plus `cloudkms.cryptoKeyVersions.viewPublicKey`, and choose configuration delivery for active and retiring key-version mappings. Then add KMS readiness checks and activate only the secret-key-protected verification path; do not expose KMS configuration or public thresholds to browsers.

## 2026-11-11 — Environment-secret verification-token key provider selected

- Contributor role: implementation
- Area: P6.1 token signing key delivery
- What changed: replaced the unused Google Cloud KMS adapter with an environment-secret provider. It reads an active `kid` and PKCS#8 Ed25519 private PEM from deployment-provided environment variables, accepts literal `\\n` escapes for ordinary environment-secret delivery, derives the matching public key only in memory, and optionally accepts a JSON map of retiring public PEMs for verification during key rotation. Configuration errors are generic and never include secret values. Removed the Google KMS dependency and stale generated KMS artifacts; no Google Cloud resource or live connection was created.
- Why: this is the selected no-cost deployment path while preserving the fixed `EdDSA` token profile, key rotation support, and the rule that private material is neither stored in PostgreSQL nor sent to browsers.
- Verification: focused environment-provider plus token signing/verifier tests passed (7 tests). Direct API TypeScript no-emit and emitting builds passed, and targeted formatting checks passed. No services, databases, browsers, ports, or listeners were started.
- Follow-up: keep `TRACE_CAPTCHA_TOKEN_SIGNING_KEY_PEM` only in the deployment secret store/environment, never in `.env.example`, logs, or source control. Before token issuance or verification endpoints are enabled, wire this provider through validated runtime configuration/readiness, add authenticated server-token verification routing, and configure active/retiring key rotation. The `/verify` challenge route remains disabled.

## 2026-11-11 — Token key startup validation and readiness completed

- Contributor role: implementation
- Area: P6.1 runtime configuration and readiness
- What changed: added required configuration for the token issuer, active key ID, PKCS#8 Ed25519 private PEM, and optional retiring public-key map. API startup now parses that configuration, constructs the environment-backed key providers before it can listen, and readiness confirms that the active public verification key is available in memory. Invalid missing, malformed, or unusable key material fails safely before a listener is opened. The private PEM is not placed in any HTTP response, log configuration, or readiness response.
- Why: signing cannot be considered production-ready while a service can start without its configured key material. A local environment secret has no remote dependency to probe, so successful provider construction and active-key lookup are the relevant readiness checks.
- Verification: focused configuration, environment-key, token signing/verifier, and challenge-creation tests passed (14 tests). Direct API TypeScript no-emit and emitting builds plus targeted formatting checks passed. No services, databases, browsers, ports, or listeners were started.
- Follow-up: P6.1 is complete. P6.2 remains in progress: wire the production public-key provider and Redis consumption adapter into the secret-key-authenticated `/v1/tokens/verify` route, without enabling token issuance from the challenge route.

## 2026-11-11 — Private token-verification endpoint completed

- Contributor role: implementation
- Area: P6.2 token verification integration
- What changed: enabled only `POST /v1/tokens/verify`. It authenticates the supplied private server credential against the customer/site repository, uses that stored customer and site binding to verify the signed claims, and uses the site ID as the fixed JWT audience. Valid final-use requests atomically consume the `jti` through the existing Redis adapter; wrong action, wrong site, expiry, signature failure, or replay return only `{ "valid": false }`. Invalid private credentials return the established generic `401`; credential/key/Redis failures return generic `503`. The signing boundary now also rejects attempts to issue a token whose audience differs from its site ID, so issuance cannot drift from verification.
- Why: final authorization must be a server-to-server operation scoped by an authenticated private credential, rather than request-controlled customer/site/audience fields. Uniform invalid-token results avoid exposing cryptographic or policy internals while preserving explicit outage signaling.
- Verification: focused in-memory Fastify injection and token tests passed (17 tests), covering valid consumption, replay rejection, wrong-action non-consumption, invalid private credentials, and credential-store outage mapping. Direct API TypeScript no-emit and emitting builds plus targeted formatting checks passed. No services, databases, browsers, ports, or listeners were started.
- Follow-up: P6.2 is complete. Token issuance remains disabled because `/v1/challenges/{challengeId}/verify` still requires its separate authenticated binding, atomic challenge consumption, trace scoring, and public-policy mapping. P6.3 can now provide customer backend integration guidance.

## 2026-11-11 — Customer server token-verification guide completed

- Contributor role: implementation
- Area: P6.3 customer server integration
- What changed: added a copyable Node/TypeScript helper and backend integration guide for the private token-verification endpoint. It treats browser tokens as untrusted, submits only from a backend with `consume: true`, distinguishes invalid, unavailable, and credential-misconfiguration outcomes, rejects oversized token input locally, and validates the minimal response shape. The guide requires the customer backend to derive the expected action from a pending operation stored and owned by its authenticated server-side session, then complete that operation only after a valid consuming verification.
- Why: browser widget state and client-supplied actions cannot authorize a protected operation. A narrow copyable example gives customer backends a safe default without distributing signing keys or asking them to reproduce JWT verification logic.
- Verification: targeted formatting checks passed. This is documentation-only work; no application source, services, databases, browsers, ports, or listeners were started.
- Follow-up: P6.3 is complete. P6.4 should add adversarial token security tests, including wrong algorithm/type, malformed claims, key rotation, replay, and unavailable-dependency behavior across the route boundary.

## 2026-11-11 — Adversarial token security coverage completed

- Contributor role: implementation
- Area: P6.4 token security tests
- What changed: extended the token test suite with malformed compact tokens; fixed-but-wrong algorithm and token type headers; unknown `kid`; valid signatures carrying wrong issuer, audience, customer, or site claims; a missing required claim; unavailable verification-key and consumption dependencies; and environment-key rotation. The rotation test confirms a retiring public key validates an unexpired token while an unknown key ID remains invalid. Invalid candidates are confirmed not to reach the consumption store; replay and wrong-action non-consumption remain covered at the private route boundary.
- Why: token failures must be fail-closed regardless of whether the defect is in a caller-controlled compact token, claim scope, key lifecycle, replay attempt, or required dependency. Testing validly signed bad claims prevents the suite from relying only on signature failure.
- Verification: focused token security tests passed (14 tests). Direct API TypeScript no-emit and emitting builds plus targeted formatting checks passed. No services, databases, browsers, ports, or listeners were started.
- Follow-up: Phase 6 is complete. The next phase should add deterministic risk-policy inputs and tests without changing the already disabled challenge-verification issuance route.

## 2026-11-11 — Normalized risk decision context completed

- Contributor role: implementation
- Area: P7.1 risk-context boundary
- What changed: expanded the risk-engine context into a strict runtime-normalized shape containing action, authenticated site ID, nullable session and attempt references, bounded nullable site/session action counters, bounded nullable action/challenge failure counts, and a nullable coarse prior-abuse indicator. The normalizer rejects unknown root or nested fields, arrays, non-plain objects, malformed identifiers, invalid booleans, and out-of-range counts. Omitted approved values normalize to explicit `null` rather than an inferred value.
- Why: future policy rules need stable, explainable server-side inputs while preserving the P0.4 collection boundary. Browsers may provide only the existing action/session/attempt references; counters, failures, and customer signals are reserved for approved server-side collectors and do not accept arbitrary client-provided metrics or scores.
- Verification: focused risk-context tests passed (3 tests), and direct risk-engine TypeScript no-emit and emitting builds plus targeted formatting checks passed. No services, databases, browsers, ports, or listeners were started.
- Follow-up: P7.2 should populate only the approved aggregate fields from bounded server-side state, with clear TTL/retention behavior and no raw browser event storage. Keep `/v1/decisions` disabled until its domain and policy layers are complete.

## 2026-11-11 — Bounded risk feature aggregation completed

- Contributor role: implementation
- Area: P7.2 risk feature summaries
- What changed: added a pure risk-engine aggregate summary that counts only decision requests, action failures, and challenge failures for one authenticated site/action/session scope. It stores no raw browser events, trace points, credentials, content, or fingerprints. The summary has a fixed 15-minute expiry, saturates counters at the existing safe bound, rejects updates after expiry, and converts expired or missing summaries back into explicit `null` risk-context signals. Applying a summary to another site, action, or session is rejected.
- Why: future deterministic rules need bounded velocity and failure evidence, but they must not turn request handling into a raw interaction log or retain temporary state indefinitely. A fixed window prevents repeated activity from extending retention forever.
- Verification: focused risk-engine P7.1/P7.2 tests passed (6 tests), and direct risk-engine TypeScript no-emit and emitting builds plus targeted formatting checks passed. No services, databases, browsers, ports, or listeners were started.
- Follow-up: P7.3 should define named, versioned deterministic rules over these explicit inputs. Keep `/v1/decisions` disabled until policy mapping and endpoint authentication are complete.

## 2026-11-11 — Explainable deterministic risk rules completed

- Contributor role: implementation
- Area: P7.3 risk rule evaluation
- What changed: added the internal `deterministic-v1` assessment with named outcomes for recovery-action sensitivity, site/session request velocity, recent action/challenge failures, coarse customer abuse indication, challenge expiry/replay, and trace retry/escalation evidence. It returns only a risk band plus ordered internal rule IDs. Individual signals can raise risk to `elevated` or `high`; `severe` requires two or more independent high-risk outcomes, so no single behavioral signal is treated as proof of automation or a block decision.
- Why: named, versioned deterministic rules make risk assessment inspectable and reproducible before policy mapping. Challenge and trace evidence remain server-derived inputs, while thresholds and matched rule IDs remain internal rather than browser responses.
- Verification: focused risk-engine P7.1/P7.3 tests passed (9 tests), and direct risk-engine TypeScript no-emit and emitting builds plus targeted formatting checks passed. No services, databases, browsers, ports, or listeners were started.
- Follow-up: P7.4 should map these internal risk bands through each action's stored policy decisions, with no public exposure of rule IDs or thresholds. Keep `/v1/decisions` disabled until the complete authenticated flow is ready.

## 2026-11-11 — Action-specific risk policy mapping completed

- Contributor role: implementation
- Area: P7.4 risk-band policy mapping
- What changed: added a pure internal mapper from `low`, `elevated`, `high`, and `severe` risk bands to the corresponding configured action-policy decisions. It preserves existing conservative defaults: signup/login may allow low risk, while password reset and OTP request challenge even low risk. The mapper returns no scores, thresholds, or rule IDs. `retry` remains intentionally reserved for challenge-verification outcomes rather than initial risk-policy selection.
- Why: risk assessment and customer policy need separate, testable responsibilities. This lets each sensitive action choose stricter friction without turning any single rule into a public decision or exposing internal rationale to browsers.
- Verification: focused P7 policy/default tests passed (12 tests), and direct risk-engine TypeScript no-emit and emitting builds plus targeted formatting checks passed. No services, databases, browsers, ports, or listeners were started.
- Follow-up: P7.5 should add explicit observe-only policy behavior before `/v1/decisions` is enabled. Keep current route placeholders and challenge issuance unchanged.

## 2026-11-11 — Observe-only risk policy mode completed

- Contributor role: implementation
- Area: P7.5 policy calibration mode
- What changed: added explicit `enforce` and `observe_only` policy modes. Observe-only evaluates the same internal band and action policy but returns an effective `allow` with a server-side `wouldDecision`; enforce returns the mapped decision directly. Added aggregate-safe observe-only records and summaries for would-have-challenged counts plus optional customer-provided completed, failed, or abandoned action outcomes. They contain no session reference, raw context, browser signal, score, or rule ID.
- Why: customers need to measure expected challenge friction before enforcement without receiving a browser-visible bypass signal or turning calibration data into a detailed behavior log. Mode is an explicit configuration input that must be selected by the site's environment configuration when future persistence/endpoint wiring is added.
- Verification: focused P7.1/P7.5 risk-engine tests passed (13 tests), and direct risk-engine TypeScript no-emit and emitting builds plus targeted formatting checks passed. No services, databases, browsers, ports, or listeners were started.
- Follow-up: P7.6 should expand deterministic policy tests across low/elevated/high/severe, retry/cooldown/block, missing/stale/conflicting signals, and observe-only behavior. Keep `/v1/decisions` disabled.

## 2026-11-11 — Deterministic risk and policy coverage completed

- Contributor role: implementation
- Area: P7.6 policy test matrix
- What changed: added an end-to-end pure risk-engine matrix that composes context normalization, feature application, deterministic assessment, policy mapping, and policy mode. It fixes expected low→allow, elevated→challenge, high→cooldown, severe→block, and observe-only would-have-challenge behavior. It also proves missing/expired summaries resolve to absent signals and conflicting site scope is rejected. The existing trace-policy suite is included for the separate retry path and perfect-geometry/naturalness guardrails.
- Why: policy behavior needs reproducible evidence across the actual composition boundary, not only isolated helper tests. This protects against accidental policy changes that could increase friction or turn one imperfect signal into enforcement.
- Verification: focused risk/trace policy matrix passed (20 tests), and direct risk-engine TypeScript no-emit and emitting builds plus targeted formatting checks passed. No services, databases, browsers, ports, or listeners were started.
- Follow-up: P7.6 is complete. P7.7 can wire the authenticated public-site decision flow only after selecting its aggregate feature storage adapter and preserving this internal/public boundary.

## 2026-11-11 — Decision service composition started

- Contributor role: implementation
- Area: P7.7 decision endpoint groundwork
- What changed: added an API-local decision service that authenticates the browser site/origin, normalizes its bounded action/session/attempt context, reads/writes the risk-engine aggregate summary, evaluates deterministic internal rules, maps the selected site/action policy, and returns only a generated decision ID plus public decision. It fails safely for invalid sites and dependencies. The API now explicitly depends on the local risk-engine workspace package.
- Why: this composes the already tested risk pieces behind an API boundary without accepting browser scores or returning bands, counters, rule IDs, or thresholds.
- Verification: focused in-memory decision-service tests passed (2 tests). Direct API TypeScript no-emit and emitting builds plus targeted formatting checks passed. No services, databases, browsers, ports, or listeners were started.
- Follow-up: implement the Redis TTL summary-store adapter, PostgreSQL active-policy lookup, runtime wiring, and the authenticated `/v1/decisions` route before marking P7.7 complete.

## 2026-11-12 — Authenticated decision endpoint completed

- Contributor role: implementation
- Area: P7.7 decision endpoint
- What changed: completed `POST /v1/decisions` with public-site-key plus Origin authentication, an explicit allowlist of the four agreed initial actions, strict bounded request context, and a generic fail-closed result for unavailable policy or feature dependencies. The runtime now reads the current active site/action policy from PostgreSQL and stores only the bounded risk-engine feature summary in Redis for its fixed 15-minute TTL. Redis keys hash the optional session reference instead of embedding it. The response deliberately contains only a generated decision ID and public decision; it returns no band, score, counter, rule ID, threshold, or reason category. Browser CORS preflight and successful decision responses are supported, and a `challenge` decision can use the existing owned challenge-creation endpoint.
- Why: the API must derive policy results from authenticated server-side configuration and temporary aggregates, rather than caller-provided scores or a browser success flag. Returning no public rationale prevents policy internals from becoming an oracle.
- Verification: focused in-memory adapter, repository, decision-service, and Fastify-injection route tests passed (8 tests). Direct API TypeScript no-emit and emitting builds plus targeted formatting checks passed. No services, databases, migrations, browsers, ports, or listeners were started.
- Follow-up: P7 is complete. P8 should implement the browser client's `protect(action)` flow against this endpoint, then request a challenge only for its public `challenge` decision. Challenge verification/scoring remains intentionally disabled and P4.3 still requires documented human browser/accessibility QA.

## 2026-11-12 — Framework-neutral browser decision client completed

- Contributor role: implementation
- Area: P8.1 browser SDK API
- What changed: added `createTraceCaptchaClient`, a framework-neutral browser client that sends only a site public key, action, and optional session reference to `/v1/decisions`. It exposes explicit `idle`, `requesting`, public-decision, `unavailable`, and `destroyed` states through a callback and getter. It validates the endpoint, its own public inputs, and the server response before returning a decision; unknown response fields are discarded. A client accepts one in-flight request, rejects a second with a typed error, and has idempotent `destroy()` cleanup that aborts an active request and permanently disables that instance. Independently initialized clients do not share state.
- Why: customer applications need a small API that centralizes decision requests without putting a private credential, scoring input, score, rule ID, or browser-side success authority into the integration. Failure, malformed response, and teardown paths must never become an `allow` result.
- Verification: focused browser SDK tests with mocked fetch responses passed (11 tests). Direct browser SDK TypeScript no-emit and emitting builds plus targeted formatting checks passed. No browser, service, database, port, or listener was started.
- Follow-up: P8.2 can expose the existing renderer and this client through a Web Component. It must request a fresh owned challenge only after the client receives `challenge`; it must not convert client state to protected-action authorization. Challenge verification/scoring remains intentionally disabled and P4.3 still needs human browser/accessibility QA.

## 2026-11-12 — Framework-neutral Web Component completed

- Contributor role: implementation
- Area: P8.2 browser SDK Web Component
- What changed: added the `trace-captcha` Shadow-DOM Web Component and its one-time registration helper. It accepts `site-key`, `endpoint`, `action`, and optional `session-id` through attributes or properties; emits bubbling `tracecaptcha-statechange` events; and uses the existing decision client, owned-challenge request helper, and canvas renderer. A fresh challenge request is permitted only after the public decision client returns `challenge`; challenge responses are validated before rendering. Component styles, live status, canvas, and fallback control are isolated inside Shadow DOM.
- Why: plain HTML and non-React integrations need the same narrow decision-to-rendering flow without duplicating policy trigger logic or leaking styles into the host page. The public component intentionally exposes UI state only; no browser event, locally collected trace, or canvas state can authorize a protected action.
- Verification: added focused mocked-fetch coverage for challenge creation after a `challenge` decision, non-challenge rejection without a request, and malformed challenge responses. The browser SDK test suite passed (14 tests); TypeScript no-emit and emitting builds passed; targeted Prettier checks passed. No browser, service, database, port, or listener was started.
- Follow-up: P8.2 is complete. Challenge verification/scoring remains intentionally disabled: after a local trace, the component reports `verification_disabled`, sends no trace, and offers the customer-controlled fallback. P4.3 remains [~] until documented human browser/accessibility QA is completed; do not treat the component's state as protected-action authorization. P8.3 can add an adapter without duplicating the component's policy or challenge flow.

## 2026-11-12 — Optional React adapter completed

- Contributor role: implementation
- Area: P8.3 browser SDK React adapter
- What changed: added the optional `@tracecaptcha/browser-sdk/react` entry point with a `TraceCaptcha` React component and ref handle. It renders the existing `trace-captcha` element, forwards its supported configuration, registers the element once on the client, and subscribes to sanitized `tracecaptcha-statechange` details for idiomatic `onStateChange` callbacks. The package declares React as a peer dependency and uses React plus its types only for local development/building. Updated the workspace build policy to explicitly skip the unrelated `esbuild` lifecycle script so dependency installation can remain non-executing.
- Why: React consumers can use a native component and ref without copying decision, challenge-request, rendering, trace, or authorization behavior. State callbacks remain browser UI signals and cannot serve as a protected-action authorization result.
- Verification: focused browser SDK and React-adapter tests passed (15 tests). Browser SDK TypeScript no-emit and emitting builds passed, and targeted Prettier checks passed. No browser, service, database, port, or listener was started.
- Follow-up: P8.3 is complete. P8.4 should publish copyable framework-neutral and React integration examples, including the required backend token-verification step and the fact that `verification_disabled` is not success. P4.3 remains [~] pending documented human browser/accessibility QA.

## 2026-11-12 — Customer integration examples completed

- Contributor role: implementation
- Area: P8.4 public browser and backend integration guidance
- What changed: added a public browser SDK guide with copyable framework-neutral Web Component and React examples, site-key handling, state/recovery table, and the required backend signup token-consumption boundary. Updated the README documentation index, current-scope description, and status so it no longer implies that a locally completed trace is currently server-verified.
- Why: customers need a narrow integration path that follows policy decisions without reimplementing CAPTCHA-triggering logic or treating browser events as authorization. Documentation now states that challenge verification/scoring is deliberately disabled and that `verification_disabled` requires fallback rather than protected-action completion.
- Verification: targeted Prettier checks passed for the updated public Markdown files. Documentation-only work; no application source, service, database, browser, port, or listener was started.
- Follow-up: P8 is complete. P4.3 remains [~] pending documented human browser/accessibility QA. Challenge verification/scoring remains disabled until its server route is implemented and must not be represented as available to integrators. P9.1 is the next planned implementation task.

## 2026-11-12 — Rate-limit foundation started

- Contributor role: implementation
- Area: P9.1 decisions and challenge creation
- What changed: added a Redis Lua-backed fixed-window limiter with independent endpoint, customer/site/action, optional session/action, and optional hashed network/action counters. Wired the limiter into authenticated decision and challenge-creation services; a rejected request returns a generic `429 rate_limited` response with `Retry-After`. Redis keys hash scoped values, so session and network references are not stored directly. Added in-memory counter and route coverage.
- Why: decisions and challenge creation can otherwise create unbounded policy, database, and challenge-generation work. Limits are applied only after public-site authentication, and their generic response does not expose policy thresholds or risk assessment details.
- Verification: focused rate-limit, decision-route, and challenge-creation Fastify-injection tests passed (10 tests). API TypeScript no-emit and emitting builds passed; targeted Prettier checks passed. No service, database, browser, port, or listener was started.
- Follow-up: P9.1 remains [~]. Persist configurable rate-limit policies per site/action and enforce the verification-path limit when the separate authenticated challenge-verification service exists. Challenge verification/scoring remains disabled; P4.3 remains [~] pending human browser/accessibility QA.

## 2026-11-12 — Durable site/action rate-limit policies completed

- Contributor role: implementation
- Area: P9.1 rate-limit configuration
- What changed: added a policy migration that persists decision and challenge-creation limit windows and scope thresholds as `rate_limits` on each site/action policy version. Added the PostgreSQL active-policy lookup and changed runtime enforcement to load the configured policy for the authenticated site/action rather than use static application defaults. Missing or malformed rate-limit configuration fails closed as unavailable.
- Why: limits must be tunable per customer site and protected action without exposing thresholds to browsers or requiring application redeployment. Binding the configuration to the existing versioned policy record preserves a stable security configuration history.
- Verification: focused rate-limit, policy-repository, decision-route, and challenge-creation Fastify-injection tests passed (12 tests). API TypeScript no-emit and emitting builds passed. Targeted TypeScript Prettier checks passed; the SQL migration was inspected but is not format-checked because the configured Prettier setup has no SQL parser. No service, database, browser, port, or listener was started, and no migration was applied.
- Follow-up: P9.1 remains [~] until the separately authenticated challenge-verification path can enforce its own configured limit. Challenge verification/scoring remains disabled; P4.3 remains [~] pending human browser/accessibility QA.

## 2026-11-12 — Idempotency-store foundation completed

- Contributor role: implementation
- Area: P9.2 idempotency and concurrency protection
- What changed: added a Redis-backed idempotency reservation store with customer/site/endpoint scope, hashed storage keys, request fingerprints, completed-response replay, conflicting-key rejection, and pending-operation detection. A failed operation releases its reservation; a failed completion write retains the pending reservation so a duplicate cannot create another operation during the TTL.
- Why: a retryable state-changing endpoint needs one original result per customer-scoped key and request fingerprint. The foundation prevents a later route adapter from creating a second challenge when callers retry a network-ambiguous request.
- Verification: focused idempotency tests passed (2 tests). API TypeScript no-emit and emitting builds passed; targeted Prettier checks passed. No service, database, browser, port, or listener was started.
- Follow-up: P9.2 remains [~]. Wire this store to authenticated challenge-creation requests with the documented `Idempotency-Key` contract, then add route-level duplicate/conflict tests. Existing atomic challenge and token consumption behavior remains covered separately.

## 2026-11-12 — Challenge-creation idempotency completed

- Contributor role: implementation
- Area: P9.2 idempotency and concurrency protection
- What changed: wired the Redis reservation/replay store into authenticated `POST /v1/challenges`. An optional `Idempotency-Key` is scoped to the authenticated customer and site, with a fingerprint over action, session reference, and decision ID. Matching retries replay the original response without allocating a second challenge or incrementing its rate-limit counters; changed reuse returns `409 idempotency_conflict`, and a simultaneous matching request returns `409 idempotency_in_progress`. Challenge preflight now permits the header, runtime creates the Redis store, and the public browser guide documents the contract.
- Why: a network-ambiguous retry after challenge creation must not leave callers with multiple active challenges or change the server-side result. Authentication and scoped fingerprints prevent a key from becoming a cross-customer replay mechanism.
- Verification: focused idempotency, challenge creation, rate-limit, active-policy, and decision-route tests passed (15 tests). API TypeScript no-emit and emitting builds passed; targeted Prettier checks passed. No service, database, browser, port, or listener was started.
- Follow-up: P9.2 is complete. P9.1 stays [~] because the deliberately disabled challenge-verification endpoint has no authenticated verification boundary to rate-limit. P9.3 requires a customer-facing outage fallback decision before implementation. P4.3 remains [~] pending documented human browser/accessibility QA.

## 2026-11-12 — Customer-owned outage fallback completed

- Contributor role: implementation
- Area: P9.3 outage behavior
- What changed: confirmed and documented that TraceCAPTCHA reports a generic recoverable `503 service_unavailable` for decision, challenge, Redis, or signing-key dependency failures rather than making a platform fail-open/fail-closed choice. The browser SDK reports `unavailable` and performs no automatic retry; customer code can explicitly retry or apply its own per-action fallback through trusted application/backend logic. Added focused SDK coverage proving an unavailable decision remains unavailable until a caller-initiated retry obtains a normal decision.
- Why: outage continuation is a customer business and risk decision. Letting a mutable browser decide final authorization would create a bypass, while prescribing one global fallback would not fit every customer's signup, login, recovery, and OTP risk profile.
- Alternatives considered: TraceCAPTCHA-selected all-action fail-closed defaults and a signup/login fail-open default. Both were declined in favor of customer-owned fallback policy and a generic, non-authorizing availability signal.
- Verification: focused browser SDK tests passed (15 tests); browser SDK TypeScript no-emit and emitting builds passed; targeted Prettier checks passed. Focused API decision/challenge/token outage and token-verification tests passed (17 tests). No service, database, browser, port, or listener was started.
- Follow-up: P9.3 is complete. Token verification remains fail closed. P9.1 remains [~] while challenge verification is deliberately disabled, and P4.3 remains [~] pending documented human browser/accessibility QA.

## 2026-11-12 — Aggregate observability storage foundation completed

- Contributor role: implementation
- Area: P9.4 aggregate observability
- What changed: added a PostgreSQL daily-bucket schema and recorder for aggregate operational metrics. Each bucket is limited to customer, site, protected action, metric name, event count, optional summed duration, and update time. The allowed metric vocabulary covers decisions, challenge creation/completion/retry/expiry/replay, dependency unavailability, and token verification outcomes. The recorder deliberately has no request, session, network, trace, token, score, or rule inputs.
- Why: operations need measurable friction and reliability trends without turning observability into a behavioral-event store. A constrained storage boundary prevents accidental persistence of raw traces or policy internals as metric work expands.
- Verification: focused aggregate-recorder tests passed (2 tests); API TypeScript no-emit and emitting builds passed; targeted Prettier checks passed. The migration was added but not applied. No service, database, browser, port, or listener was started.
- Follow-up: P9.4 remains [~]. Wire safe live events, duration, abandonment, false-positive reports, and dependency health into the aggregate store; retain the 90-day aggregate policy and do not add raw identifiers. P9.1 and P4.3 remain [~] for their existing documented reasons.

## 2026-11-12 — Initial aggregate metrics wired

- Contributor role: implementation
- Area: P9.4 aggregate observability
- What changed: wired successful authenticated decision outcomes and challenge creation/idempotent replay events into the daily aggregate recorder. Recorder failures are ignored deliberately, so PostgreSQL observability availability cannot alter a security decision, challenge response, or customer fallback behavior. Added focused coverage for `decision_allow`, `challenge_created`, and `challenge_replayed` emissions.
- Why: operators can begin measuring decision friction and duplicate challenge retries without storing user identifiers or making telemetry a dependency of protected-action flows.
- Verification: focused aggregate-recorder, decision, and challenge tests passed (10 tests). API TypeScript no-emit and emitting builds passed; targeted Prettier checks passed. No service, database, browser, port, or listener was started; the migration was not applied.
- Follow-up: P9.4 remains [~]. Challenge completion/retry/expiry, duration, abandonment, false-positive reports, and dependency health need safe aggregate sources when the separate verification service is enabled. P9.1 and P4.3 remain [~] for their existing documented reasons.

## 2026-11-12 — Accessibility and privacy implementation review completed

- Contributor role: implementation review
- Area: P9.5 accessibility and privacy behavior
- What changed: reviewed the existing browser SDK's visible focus, keyboard reset, pointer/touch handling, live status, fallback control, and non-authorizing recovery states against the public integration guidance. Added a precise current browser-data section: decisions send only public site key, action, and optional session reference; challenge creation adds the public decision ID; private credentials, scores, rules, canonical targets, passwords, page content, keystrokes, and local traces are not sent. Current local traces are not submitted because server verification remains disabled.
- Why: public integration guidance must describe actual collection and recovery behavior, not the planned verification design. This makes the temporary verification limitation and customer-controlled accessible alternative explicit.
- Verification: existing focused browser SDK test coverage and static source review were used; targeted Markdown formatting checks were run. No browser, service, database, port, listener, or human screen-reader session was started.
- Follow-up: P9.5 remains [~] and P4.3 remains [~]. Documented human browser/device/keyboard/screen-reader QA is still mandatory before either can be marked complete. Confirm aggregate retention/deletion operationally only after the migration is deployed; no migration was applied.

## 2026-11-12 — MVP release documentation completed

- Contributor role: documentation
- Area: P10.2 first release documentation
- What changed: added an MVP release-readiness guide and linked it from the README. It defines Chrome, Safari, Firefox, and Brave as the supported browser target, describes other Chromium-based browsers as expected-compatible but not independently guaranteed, lists customer integration and authorization responsibilities, and makes the current verification, observability, and human-QA limits explicit.
- Why: release documentation must make the implementation's actual boundary clear. Chrome coverage provides strong shared-platform coverage for Chromium browsers, but Brave and other derivatives can have browser-specific privacy or extension behavior that still requires customer validation.
- Verification: targeted Markdown formatting checks passed. Documentation-only work; no service, database, browser, port, or listener was started.
- Follow-up: P10.2 is complete. P10.1 remains [~]: challenge verification is intentionally disabled, P4.3 human browser/accessibility QA remains pending, and the required end-to-end scenarios cannot yet pass.

## 2026-11-12 — Aggregate dependency-unavailability metrics wired

- Contributor role: implementation
- Area: P9.4 aggregate observability
- What changed: authenticated decision and challenge-creation flows now emit the existing generic `dependency_unavailable` daily aggregate bucket when a required policy, rate-limit, idempotency, or challenge-store dependency cannot provide a result. The event includes only the already-authenticated customer, site, and protected action; it includes no dependency name, request, session, network address, trace, token, score, rule ID, or other per-event identifier. Metric-recorder failures remain ignored so observability cannot affect authorization or availability.
- Why: operations can measure customer-facing dependency impact by protected action while preserving the aggregate-only storage boundary and generic `503 service_unavailable` public behavior.
- Verification: focused aggregate-metrics, risk-decision, and challenge-creation tests passed (12 tests). API TypeScript no-emit and emitting builds passed, and targeted Prettier checks passed. No service, database, browser, port, or listener was started; the migration was not applied.
- Follow-up: P9.4 remains [~]. A trusted aggregate-only false-positive-report source still needs a separate public-contract and authorization decision. Completion/retry/expiry/duration/abandonment still wait for the deliberately disabled verification service. P9.1, P4.3, P9.5, and P10.1 retain their existing pending status.

## 2026-11-12 — Aggregate false-positive reporting completed

- Contributor role: implementation
- Area: P9.4 aggregate observability
- What changed: added authenticated `POST /v1/observability/false-positive-reports` for trusted customer backends. It accepts exactly one protected action and records a `false_positive_reported` daily aggregate bucket scoped by the authenticated customer and site. The strict request schema rejects sessions, traces, tokens, scores, rules, user identifiers, and all other extra fields. Added a follow-up migration to extend the metric vocabulary; it was not applied.
- Why: operators need a privacy-bounded customer outcome signal to evaluate possible friction without introducing per-user reporting or allowing browser input to influence aggregate metrics.
- Verification: focused aggregate-metrics, false-positive-reporting, risk-decision, and challenge-creation tests passed (16 tests). API TypeScript no-emit and emitting builds passed. Targeted Prettier checks passed for TypeScript, OpenAPI, and Markdown; the configured formatter has no SQL parser, so the migration was manually reviewed. No service, database, browser, port, or listener was started; no migration was applied.
- Follow-up: P9.4 remains [~]. Completion/retry/expiry, duration, and abandonment metrics still wait for the deliberately disabled verification service. P9.1 and P4.3 remain [~]; P9.5 and P10.1 retain their existing human-QA and verification prerequisites. The false-positive report is operational telemetry only and never a verification or authorization result.

## 2026-11-12 — Server-authoritative challenge verification enabled

- Contributor role: implementation
- Area: P4.4, P5.4, P6.1, P9.1, P9.4
- What changed: replaced the deliberate `501` verification placeholder with an authenticated browser-origin-bound verification service. It consumes the active Redis challenge before normalizing/scoring the bounded trace, checks customer/site/action binding, returns `retry` or `cooldown` without a token for non-accepted traces, and issues an EdDSA token only for an accepted server assessment. Added a configured verification-specific rate-limit endpoint and migration. The Web Component now submits only its active challenge trace, exposes any returned token as an untrusted event handoff, and requests a fresh policy flow after consumed/retry recovery instead of reusing a challenge. Aggregate completion/retry/observed-expiry/duration metrics are emitted without raw trace persistence.
- Why: the server must remain the sole authority for trace scoring, challenge single-use, policy outcome, and token issuance. The browser can transport a token to the customer backend but cannot turn a UI event, local trace, or token into authorization.
- Verification: complete API unit suite passed (75 tests). Browser SDK core and React-adapter unit suites passed (16 tests total). API and browser SDK TypeScript no-emit and emitting builds passed. Targeted Prettier checks passed for source, contracts, and documentation; the configured formatter has no SQL parser, so migrations were manually reviewed. No service, database, browser, port, or listener was started; migrations were not applied.
- Follow-up: trace thresholds are explicitly provisional and require real usability/abuse calibration before production rollout. P4.3/P9.5 human browser/accessibility QA remain mandatory. P10.1 remains [~] until calibration and documented end-to-end release-gate scenarios pass. Customer backends must atomically verify/consume returned tokens, and customer-controlled accessible fallback remains required.

## Decision log template

### YYYY-MM-DD — Short decision title

- Contributor role:
- Area:
- What changed:
- Why:
- Alternatives considered:
- Verification:
- Follow-up:
