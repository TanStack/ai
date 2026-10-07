---
'@tanstack/ai-react': patch
'@tanstack/ai-preact': patch
'@tanstack/ai-solid': patch
'@tanstack/ai-vue': patch
'@tanstack/ai-svelte': patch
'@tanstack/ai-angular': patch
'@tanstack/ai-remix': patch
'@tanstack/ai-octane': patch
---

Skip the devtools bridge in production builds. The chat, generation and video hooks passed the real devtools bridge every time, so production builds deep-copied every message on each streamed chunk even with no devtools panel open. They now pass it only when `NODE_ENV` is not `production`, and the client falls back to its no-op bridge.
