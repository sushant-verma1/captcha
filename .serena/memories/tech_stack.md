# Technology stack

- Node >=22.14; TypeScript strict, NodeNext/ES2023; pnpm 12.3.4 workspace.
- API: Fastify 5, Zod 3, ESM. Contract: OpenAPI 3.1 in openapi.yaml.
- Packages: apps/api; packages/shared-types, captcha-engine, risk-engine, browser-sdk.
- Planned storage: Redis for expiry, locks, rate limits, idempotency; PostgreSQL for tenants, policies, audit and aggregate outcomes.
- Browser direction: framework-neutral Web Component, Canvas, Pointer Events; React adapter only after core API stabilizes.