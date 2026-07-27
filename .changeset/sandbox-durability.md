---
'@tanstack/ai-sandbox': minor
---

Durable **sandbox instance** resume for multi-process / multi-replica deploy.

- **`SandboxInstanceStore` / `SandboxInstanceRecord` / `InMemorySandboxInstanceStore` / `SandboxInstanceStoreCapability`** in `@tanstack/ai-sandbox`
- **`withSandboxInstanceStore(store)`** provides the capability; **`withSandbox`** consumes it in `ensure` (in-memory fallback when absent)
- Pair multi-instance with **`withLocks`** from `@tanstack/ai/locks` (distributed lock)
- Independent of chat persistence — compose both when the app needs transcript durability _and_ instance reuse
- Conformance: `runSandboxInstanceStoreConformance` from `@tanstack/ai-sandbox/testkit`
