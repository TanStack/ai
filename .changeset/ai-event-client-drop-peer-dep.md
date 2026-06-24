---
'@tanstack/ai-event-client': patch
---

Drop the unused `@tanstack/ai` peerDependency. `@tanstack/ai-event-client` mirrors the middleware types it needs locally and imports nothing from `@tanstack/ai`, so the peer dep only manufactured a package-manifest cycle (`@tanstack/ai` already depends on `@tanstack/ai-event-client`). Removing it — and the matching `!@tanstack/ai` Nx `implicitDependencies` workaround — keeps the build graph a clean DAG and unblocks devtools-only consumers.
