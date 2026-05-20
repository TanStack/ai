---
'@tanstack/ai': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-code-mode': patch
'@tanstack/ai-code-mode-skills': patch
'@tanstack/ai-devtools': patch
'@tanstack/ai-elevenlabs': patch
'@tanstack/ai-fal': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-groq': patch
'@tanstack/ai-isolate-node': patch
'@tanstack/ai-isolate-quickjs': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-openai': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-react-ui': patch
'@tanstack/ai-solid-ui': patch
'@tanstack/ai-vue-ui': patch
'@tanstack/openai-base': patch
'@tanstack/preact-ai-devtools': patch
'@tanstack/react-ai-devtools': patch
'@tanstack/solid-ai-devtools': patch
---

Tighten TypeScript safety: enable `noImplicitOverride`,
`noPropertyAccessFromIndexSignature`, `noFallthroughCasesInSwitch`,
and `useDefineForClassFields` in the root `tsconfig.json`; add a
typed-ESLint block scoped to `packages/typescript/*/src/**` that
turns on `no-floating-promises`, `no-misused-promises`,
`await-thenable`, `switch-exhaustiveness-check`, and
`consistent-type-exports` (errors) plus `no-explicit-any`,
`no-non-null-assertion`, and `prefer-readonly` (warnings).
`@ts-ignore` and `@ts-nocheck` are now disallowed in library source,
enforced via `@typescript-eslint/ban-ts-comment`.

User-visible API surface is unchanged; this is a hardening pass to
keep streaming/agent-loop correctness and discriminated-union
exhaustiveness honest going forward. See issue #564.
