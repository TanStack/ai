---
'@tanstack/ai-react': patch
'@tanstack/ai-solid': patch
'@tanstack/ai-vue': patch
'@tanstack/ai-svelte': patch
'@tanstack/ai-angular': patch
---

Correct the `persistence` / `threadId` JSDoc on every generation hook.

`persistence` is now `boolean`, but the tooltip still described a third value —
"a storage adapter: client-driven — the lightweight snapshot is cached under
`generation:<threadId>`" — left over from the deleted client-side persistence
surface, and `threadId` still claimed persistence keys on it "in **both**
modes". IDE tooltips on a public option were telling users to pass something
the types reject. Both now describe the server-driven-only behaviour, and
`threadId` documents that the persisted record requires it (as does
`withGenerationPersistence` on the server).
