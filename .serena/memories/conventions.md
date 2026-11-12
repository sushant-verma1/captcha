# Conventions

- TypeScript: strict mode, ESM imports with .js suffix for local API imports, explicit exported domain types.
- Keep public API types synchronized with openapi.yaml; use header X-TraceCAPTCHA-Site-Key for browser requests and X-TraceCAPTCHA-Secret-Key only for server token verification.
- Keep trace quality separate from interaction naturalness. Perfect geometry alone cannot cause automatic failure.
- Treat browser input as untrusted. Do not expose canonical target paths, thresholds, signing keys, or internal reason details.
- Preserve small, reviewable changes; update notes.md after meaningful architecture or implementation work.
- Do not start services unless asked. Do not create commits unless asked; never add agent attribution or Co-authored-by trailers.