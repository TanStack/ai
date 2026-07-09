---
'@tanstack/ai-angular': patch
'@tanstack/ai-preact': patch
'@tanstack/ai-react': patch
'@tanstack/ai-solid': patch
'@tanstack/ai-svelte': patch
'@tanstack/ai-vue': patch
---

Add the `const` modifier to the `TTools` type parameter of `useChat`
(`createChat` in Svelte, `injectChat` in Angular) so a plain inline `tools` array
now yields full type-safe message chunks. Previously the array widened to
`Array<Union>` and lost the literal tool `name`s that drive the
discriminated `tool-call` part union, so callers had to wrap their tools in
`clientTools(...)` (or add `as const`) to get narrowing. That wrapper is now
optional — `tools: [toolA, toolB]` narrows `part.name`, `part.input`, and
`part.output` on its own. `clientTools(...)` still works and remains useful
for defining a shared tuple outside the hook call.