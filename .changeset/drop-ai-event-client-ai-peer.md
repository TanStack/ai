---
'@tanstack/ai-event-client': patch
---

chore: drop unused `@tanstack/ai` peerDependency

`@tanstack/ai-event-client` never imported from `@tanstack/ai` — the middleware
and event types it needs are mirrored locally to avoid the `ai` →
`ai-event-client` (dependency) / `ai-event-client` → `ai` (peer) manifest cycle.
The peer entry was therefore dead weight, and the `!@tanstack/ai`
implicit-dependency edge in `project.json` existed solely to neutralize that
cycle in Nx's project graph.

Both are removed (the `project.json` is dropped entirely, restoring the package
to pure Nx inference like its siblings). No runtime or type surface changes, and
no consumer is affected — `@tanstack/ai`, `@tanstack/ai-client`, and
`@tanstack/ai-devtools` all depend on `@tanstack/ai-event-client` as a normal
dependency, never as a peer.
