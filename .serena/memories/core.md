# TraceCAPTCHA

- Adaptive CAPTCHA platform: owned drawing CAPTCHA plus risk wrapper that decides allow/challenge/retry/cooldown/block.
- Server is authoritative: browser input, scores, and callbacks are untrusted; challenge state, canonical targets, scoring, and tokens stay server-side.
- Source map: API details in `mem:api/core`; workspace packages in `mem:packages/core`; stack in `mem:tech_stack`; commands in `mem:suggested_commands`; coding rules in `mem:conventions`; completion checks in `mem:task_completion`.
- Canonical docs: project.md, architecture.md, plan.md, techstack.md, agent.md, notes.md. Newer explicit notes override other project docs.