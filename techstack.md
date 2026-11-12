# TraceCAPTCHA Technology Stack

## Recommended baseline

The first implementation should optimize for a small operational surface, clear contracts, and easy embedding.

## Repository and language

- TypeScript across browser, API, and shared packages
- one workspace monorepo
- package boundaries for browser SDK, API, geometry, risk, token, and shared types
- automated formatting, linting, type checking, and tests

Suggested layout:

```text
apps/
  api/
  dashboard/
  demo/

packages/
  browser-sdk/
  captcha-engine/
  risk-engine/
  token-service/
  shared-types/
  server-sdk/
```

## Browser layer

### Core choice

- TypeScript
- Web Component with Shadow DOM
- HTML Canvas
- Pointer Events
- Web Crypto API where browser-side cryptography is required for non-authoritative helpers

The core should not require React. Add a React adapter after the Web Component and imperative API are stable. This makes the provider usable by plain HTML, React, Vue, Angular, and server-rendered applications.

### Browser rules

- never ship server secrets
- never expose the authoritative target path
- never calculate the trusted final score
- sample and summarize signals instead of sending every event
- avoid collecting passwords, typed content, or page contents
- make the widget keyboard- and screen-reader-aware where possible

## API layer

- Node.js
- TypeScript
- a small HTTP framework such as Fastify
- Zod or equivalent runtime request validation
- OpenAPI as the public API contract
- structured JSON logging
- OpenTelemetry-compatible tracing when observability grows

The API should be split into services/modules rather than one large CAPTCHA route:

```text
decision
challenge
verification
configuration
health
```

## Storage layer

### Redis

Use Redis for expiring and frequently accessed data:

- challenge state
- one-time-use markers
- rate limits
- idempotency keys
- short-lived risk/session context

### PostgreSQL

Use PostgreSQL for durable configuration and analysis:

- tenants, sites, and environments
- policies
- API key metadata
- signing-key metadata
- aggregate decision outcomes
- audit records

Do not use PostgreSQL as the live store for every pointer event.

## Authentication and tokens

- separate public site keys from private server keys
- authenticate customer server calls with private credentials
- sign verification tokens with a managed key
- rotate keys without invalidating all active configuration unexpectedly
- include customer, site, action, issued-at, expiry, and unique token ID claims
- track token consumption to prevent replay

## Risk engine

Start with a deterministic rules engine:

```text
raw request/session context
        ↓
validated normalized context
        ↓
feature extraction
        ↓
rule evaluation
        ↓
risk band + reason codes
        ↓
policy decision
```

Do not introduce machine learning until the product has enough labeled outcomes to measure false positives and false negatives.

## Testing stack

Test at four levels:

1. geometry unit tests with known paths and tolerances
2. risk/policy tests with deterministic scenarios
3. API contract tests from the OpenAPI definition
4. browser integration tests for mouse, touch, stylus-like pointer input, expiry, retry, and replay

Include adversarial cases:

- modified client score
- modified coordinates
- expired challenge
- reused challenge
- reused token
- wrong action token
- duplicate requests
- rate-limit exhaustion

## Deployment baseline

```text
CDN / edge protection
        ↓
API service
   ├── Redis
   └── PostgreSQL
```

Start with one API deployment and managed Redis/PostgreSQL. Split workers or analytics processing only when traffic and retention requirements justify it.

## Avoid initially

- a microservice for every module
- a machine-learning model
- permanent raw event storage
- multiple CAPTCHA challenge families
- mandatory React integration
- a custom analytics warehouse before usage justifies it
