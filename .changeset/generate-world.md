---
'@tanstack/ai': minor
'@tanstack/ai-event-client': patch
'@tanstack/ai-reactor': minor
'@tanstack/ai-fal': minor
---

Add `generateWorld()` and `generateLive()` for prompt-steerable sessions, plus a first-party Reactor adapter (`reactorWorld`, `reactorVideo`) and fal `falLive()` for H3 Max Director. Both mint a session-scoped token. `generateVideo()` stays the job path that polls for a file URL.
