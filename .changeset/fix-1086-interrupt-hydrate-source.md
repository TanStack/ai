---
'@tanstack/ai-client': patch
'@tanstack/ai-react': patch
'@tanstack/ai-solid': patch
'@tanstack/ai-vue': patch
'@tanstack/ai-svelte': patch
'@tanstack/ai-preact': patch
'@tanstack/ai-angular': patch
---

`onInterruptStateChange` now identifies snapshot restoration (`hydrate`) separately from streamed or client-initiated interrupt updates (`live`). The source follows each state publication, so cancelling a restored batch from the callback produces subsequent `live` updates without re-entering hydration. Client-tool interrupts remain hidden from the public list in both cases; `hydrate` lets an app cancel a restored batch without cancelling one that is still running.
