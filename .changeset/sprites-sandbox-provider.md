---
'@tanstack/ai-sandbox-sprites': minor
---

Add `@tanstack/ai-sandbox-sprites`: a Sprites ([sprites.dev](https://sprites.dev), Fly.io) cloud sandbox provider implementing the `SandboxProvider` / `SandboxHandle` contract. Supports exec (with separate stdout/stderr), background processes, native filesystem I/O, exec-backed git, env injection, durable filesystem, and resume-by-id. `ports.connect()` exposes the Sprite's single proxied public-URL port. Dependency-free (REST + WebSocket); needs `SPRITES_API_KEY`.
