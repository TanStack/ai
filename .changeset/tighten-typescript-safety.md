---
'@tanstack/ai': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-code-mode': patch
'@tanstack/ai-code-mode-skills': patch
'@tanstack/ai-devtools-core': patch
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
`noFallthroughCasesInSwitch`, and `useDefineForClassFields` in the
root `tsconfig.json`; add a typed-ESLint block scoped to
`packages/typescript/*/src/**` that turns on `no-floating-promises`,
`no-misused-promises`, `await-thenable`,
`switch-exhaustiveness-check`, `consistent-type-exports`,
`prefer-readonly`, and `no-non-null-assertion` (errors), plus
`no-explicit-any` (warning). `@ts-ignore` and `@ts-nocheck` are
disallowed in library source via `@typescript-eslint/ban-ts-comment`,
and `as unknown as <T>` double-casts are blocked by a
`no-restricted-syntax` rule (escape hatches available with an inline
reason). Two flags from the original five-flag set —
`noPropertyAccessFromIndexSignature` and `exactOptionalPropertyTypes`
— were tried and rolled back: they produced ~500 lines of bracket-
access and conditional-spread churn without catching any real bugs,
and `exactOptionalPropertyTypes` would have forced consumers using
it themselves to deal with our internals' style preferences.

User-visible API surface is unchanged; this is a hardening pass to
keep streaming/agent-loop correctness and discriminated-union
exhaustiveness honest going forward. See issue #564.
