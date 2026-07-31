---
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-angular': minor
---

Deprecate generation `id` in favor of `threadId` as the single identity.

`threadId` is the scope for the wire, devtools, and persistence. When it is
supplied, `id` is typed `never` so you cannot pass both. Legacy `id` remains
only for ephemeral runs that have no `threadId` (wire/devtools fallback) and is
marked `@deprecated`.
