---
'@tanstack/ai': minor
'@tanstack/ai-persistence': minor
'@tanstack/ai-sandbox': minor
---

Move multi-instance **locks** to `@tanstack/ai` under a dedicated `@tanstack/ai/locks` subpath, and nest persistence agent skills like `ai-core`.

- **`LockStore` / `InMemoryLockStore` / `LocksCapability` / `getLocks` / `provideLocks` / `withLocks`** live in `@tanstack/ai/locks` (not the main `@tanstack/ai` barrel, and not `@tanstack/ai-persistence`).
- `@tanstack/ai-sandbox` consumes the core `LocksCapability` token (no local lock re-export).
- The locks agent skill moves with the code: `ai-core/locks` in `@tanstack/ai`, not `ai-persistence/locks`.
- Agent skills under `@tanstack/ai-persistence` nest as `skills/ai-persistence/{stores,server,build-*-adapter}/`.
- Docs: locks guide under advanced middleware.
