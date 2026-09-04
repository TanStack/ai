---
'@tanstack/ai': minor
'@tanstack/ai-event-client': patch
'@tanstack/ai-reactor': minor
'@tanstack/ai-fal': minor
---

Add `generateWorld()` and `generateLive()` for prompt-steerable sessions, plus a first-party Reactor adapter (`reactorWorld`, `reactorVideo`) and fal `falLive()` for H3 Max Director. Reactor returns a session JWT. falLive returns the WMA app id on `result.model` so the browser can call `wma(live.model)`. `generateVideo()` stays the job path that polls for a file URL.
