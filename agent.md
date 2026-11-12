# Coding Agent Rules

This file defines the rules for any coding agent working in the TraceCAPTCHA repository.

## Read before changing code

Before making implementation changes, read:

1. `project.md` for the original functional concept.
2. `plan.md` for current scope and delivery phases.
3. `architecture.md` for boundaries and trust assumptions.
4. `techstack.md` for technology decisions.
5. `notes.md` for the latest project history.

When these documents conflict, prefer the newest explicit decision in `notes.md`, then `plan.md`, then `architecture.md`. Do not silently change the product direction.

## Scope and behavior

- Do not start servers, databases, browsers, or project services unless the user explicitly asks.
- Do not add features merely because they are interesting; keep work inside the requested phase.
- Do not replace the owned drawing CAPTCHA with an external provider.
- Do not introduce machine learning before the rule-based engine has measurable outcomes.
- Do not treat the CAPTCHA as proof of humanity or as the whole anti-abuse platform.
- Ask for clarification when a decision would materially change security, privacy, data retention, or public API behavior.

## Security rules

- Treat all browser input as untrusted.
- Keep target paths, scoring thresholds, signing keys, and private credentials server-side.
- Never trust a client-provided score or success flag.
- Enforce challenge expiry and single-use behavior server-side.
- Bind verification tokens to customer, action, and expiry.
- Add rate limits to challenge, decision, and verification paths.
- Never log passwords, private keys, raw secrets, or unnecessary raw behavioral data.
- Do not add hidden tracking or collect raw keystrokes.

## Coding rules

- Preserve existing user changes.
- Use `apply_patch` for manual file edits.
- Prefer small, reviewable changes.
- Add or update tests for security-sensitive behavior and scoring changes.
- Keep public types and API contracts synchronized.
- Use explicit names for risk signals and policy decisions.
- Keep trace quality separate from interaction naturalness.
- Never make a perfect trace automatically fail without a combined policy reason.

## Documentation and project tracking

- Update `notes.md` after meaningful implementation or architecture work.
- Each note should state what changed, why it changed, and what remains unresolved.
- Update public-facing `readme.md` only with information appropriate for customers and integrators.
- Do not put internal secrets, exploit details, or private operational notes in `readme.md`.

## Git and attribution

- Do not create commits unless the user explicitly requests a commit.
- Never modify Git author identity or commit configuration.
- Never add a `Co-authored-by` trailer.
- Never add the coding agent's name as an author, co-author, contributor, or attribution in a commit message.
- Do not claim authorship for work in release notes or public documentation.

## Verification before handoff

Report:

- files changed
- checks or tests run
- checks not run and why
- security or compatibility assumptions
- any remaining decision that requires the user

Do not claim that the project works unless the relevant checks were actually run.
