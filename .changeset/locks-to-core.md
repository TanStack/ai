---
'@tanstack/ai': minor
'@tanstack/ai-persistence': minor
'@tanstack/ai-sandbox': minor
---

Move multi-instance **locks** to `@tanstack/ai` and nest persistence agent skills like `ai-core`.

- **`LockStore` / `InMemoryLockStore` / `LocksCapability` / `withLocks`** live in `@tanstack/ai` (not `@tanstack/ai-persistence`).
- `@tanstack/ai-sandbox` consumes the core `LocksCapability` token (no local lock re-export).
- Agent skills under `@tanstack/ai-persistence` nest as `skills/ai-persistence/{stores,server,locks,build-*-adapter}/`.
- Docs: locks guide under advanced middleware.
