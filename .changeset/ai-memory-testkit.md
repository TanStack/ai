---
'@tanstack/ai-memory': minor
---

Ship the memory adapter contract suite as `@tanstack/ai-memory/testkit`. `runMemoryAdapterContract` was only reachable inside the repo (`tests/contract.ts`, not published), while the custom-adapter guide told you to import it from `@tanstack/ai-memory/tests/contract`. It now lives in `src/testkit/contract.ts` and is exported the same way as `@tanstack/ai-persistence/testkit`, with `vitest` as an optional peer dependency.
