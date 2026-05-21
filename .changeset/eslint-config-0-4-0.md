---
'@tanstack/ai': patch
'@tanstack/ai-code-mode': patch
'@tanstack/ai-code-mode-skills': patch
'@tanstack/ai-elevenlabs': patch
'@tanstack/ai-fal': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-openai': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-react-ui': patch
---

Adopt `@tanstack/eslint-config@0.4.0` and clean up the local override layer.

- Bump `@tanstack/eslint-config` from `0.3.3` to `0.4.0`.
- Drop dead `pnpm/enforce-catalog` and `pnpm/json-enforce-catalog` disables (upstream removed `eslint-plugin-pnpm` in `0.3.1`).
- Drop the `no-case-declarations: off` override — no current source actually violates it.
- Drop the `no-shadow: off` override — upstream sets it to `warn`, so it surfaces in editors without blocking CI.
- Remove ~25 unnecessary type assertions across the publishable packages that the upgraded `typescript-eslint` now catches via `no-unnecessary-type-assertion`. One deliberately defensive cast in `ag-ui-wire.ts` is preserved with an inline opt-out and a reason comment.

No public-API or runtime-behavior changes.
