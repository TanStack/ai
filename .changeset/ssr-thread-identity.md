---
'@tanstack/ai-client': patch
'@tanstack/ai-react': patch
'@tanstack/ai-preact': patch
'@tanstack/ai-vue': patch
'@tanstack/ai-solid': patch
'@tanstack/ai-svelte': patch
'@tanstack/ai-angular': patch
---

Mint omitted `threadId` after the view mounts, not during render. DevTools binds the hook row to `threadId`. Persistence that is on (`true` or a storage adapter) requires a `threadId` at compile time, and throws at runtime if it is missing. Chat and generation clients no longer accept a separate `id` option. Use `threadId`.
