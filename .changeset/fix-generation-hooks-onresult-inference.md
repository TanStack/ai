---
'@tanstack/ai-react': patch
'@tanstack/ai-solid': patch
'@tanstack/ai-svelte': patch
'@tanstack/ai-vue': patch
'@tanstack/ai-angular': patch
---

Fix `onResult` transform type inference on the generation hooks across every
framework package — the base generation hook plus `generateImage`,
`generateAudio`, `generateSpeech`, `generateVideo`, `transcription`, and
`summarize` (React `use*`, Vue `use*`, Solid `use*`, Svelte `create*`, and
Angular `inject*`).

The hooks declared the `onResult` transform via a single defaulted type
parameter inferred from an optional nested property, which TypeScript collapses
to its default — leaving the callback parameter typed `any` (a hard error under
`strict`) and never narrowing `result` to the transform's return type. The
hooks now infer the transform type from the `onResult` return position (a
covariant inference site that works for an optional nested property), so the
callback parameter is typed as the raw result and `result` narrows to the
transform's return type; omitting the transform keeps the raw result type. See
issue #848.
