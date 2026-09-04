---
'@tanstack/ai': minor
'@tanstack/ai-event-client': patch
'@tanstack/ai-reactor': minor
---

Add `generateWorld()` for live, prompt-steerable world sessions, plus a first-party Reactor adapter (`reactorWorld`, `reactorVideo`) that mints a session-scoped token for Orbis, Helios, FastH3, and other Reactor world and video models. `generateVideo()` returns that token for live Reactor sessions instead of a download URL.
