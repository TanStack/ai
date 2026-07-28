---
'@tanstack/ai-sandbox': minor
---

Durable **sandbox instance** resume for multi-process / multi-replica deploy.

- **`SandboxInstanceStore` / `SandboxInstanceRecord` / `InMemorySandboxInstanceStore` / `SandboxInstanceStoreCapability`** in `@tanstack/ai-sandbox`
- **`withSandbox(sandbox, { instances, locks? })`** takes the store directly, so it cannot be mis-ordered (in-memory fallback when absent). `SandboxInstanceStoreCapability` + `provideSandboxInstanceStore` remain for ambient/platform wiring; an explicit option wins over the bus.
- **`defineSandboxInstanceStore`** for inline BYO typing (same pattern as `defineLock` / `defineMessageStore`)
- Pair multi-instance with **`withLocks`** from `@tanstack/ai/locks` (distributed lock)
- Independent of chat persistence — compose both when the app needs transcript durability _and_ instance reuse
- Conformance: `runSandboxInstanceStoreConformance` from `@tanstack/ai-sandbox/testkit`
