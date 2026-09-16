---
'@tanstack/ai-persistence': minor
'@tanstack/ai-client': minor
'@tanstack/ai': minor
'@tanstack/ai-react': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-angular': minor
'@tanstack/ai-octane': minor
'@tanstack/ai-remix': minor
---

Page long chat threads on hydrate. Pass `history: { pageSize }` with `persistence: true`. Then call `loadOlderMessages()` to prepend older turns. `withPersistence` merges incoming messages by id so a short client list keeps stored extras. `loadThread` accepts optional `limit` / `before` and can return a `MessagePage`.
