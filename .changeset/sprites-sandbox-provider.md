---
'@tanstack/ai-sandbox-sprites': minor
---

Add `@tanstack/ai-sandbox-sprites`: a Sprites (Fly.io) stateful sandbox provider implementing the `SandboxProvider` / `SandboxHandle` contract. Supports exec (with separate stdout/stderr), background processes, native filesystem I/O, exec-backed git, env injection, durable filesystem, resume-by-id, and checkpoints (`snapshot()` to create a save point; in-place `restoreCheckpoint()` / `listCheckpoints()` on the handle). `ports.connect()` exposes the Sprite's single proxied public-URL port. Dependency-free (REST + WebSocket); needs `SPRITES_API_KEY`.
