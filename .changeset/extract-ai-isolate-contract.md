---
'@tanstack/ai-isolate': minor
'@tanstack/ai-code-mode': patch
'@tanstack/ai-isolate-quickjs': patch
'@tanstack/ai-isolate-quickjs-bun': patch
'@tanstack/ai-isolate-node': patch
'@tanstack/ai-isolate-cloudflare': patch
'@tanstack/ai-isolate-e2b': patch
'@tanstack/ai-isolate-daytona': patch
---

Add `@tanstack/ai-isolate`, the engine-agnostic isolate base. It owns the contract every sandbox driver implements (`IsolateDriver`, `IsolateConfig`, `IsolateContext`, `ExecutionResult`, `NormalizedError`, `ToolBinding`) plus the shared `wrapCode` helper. These previously lived inside `@tanstack/ai-code-mode`, which forced every driver to depend on Code Mode just for the contract.

Drivers (`quickjs`, `quickjs-bun`, `node`, `cloudflare`, `e2b`, `daytona`) now depend on `@tanstack/ai-isolate` instead of `@tanstack/ai-code-mode`. `@tanstack/ai-code-mode` re-exports the same types and `wrapCode`, so its public API is unchanged.
