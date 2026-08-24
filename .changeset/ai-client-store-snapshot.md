---
'@tanstack/ai-client': minor
'@tanstack/ai-react': patch
'@tanstack/ai-solid': patch
'@tanstack/ai-vue': patch
'@tanstack/ai-svelte': patch
'@tanstack/ai-angular': patch
'@tanstack/ai-preact': patch
'@tanstack/ai-octane': patch
---

Hold client UI state in a TanStack Store atom. Framework hooks read `getSnapshot()` instead of copying fields through change callbacks. `useChat()` return shape stays the same.

`ChatClient` adds `subscribeSnapshot` / `getSnapshot`. The live connection method stays `subscribe()`. Generation, video, realtime, audio, and BYOK clients expose the same snapshot pair (`subscribe` / `getSnapshot`) where the name does not collide.
