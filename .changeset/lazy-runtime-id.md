---
'@tanstack/ai-event-client': patch
---

Defer devtools runtime-id generation to first use so importing `@tanstack/ai` is safe in edge/global scope.

`@tanstack/ai-event-client` previously seeded its runtime id at module scope by calling `crypto.randomUUID()` (falling back to `Math.random()`) inside a top-level IIFE. Because `@tanstack/ai`'s `chat()` always pulls in the devtools middleware, this random-value generation ran at module-evaluation time. Edge runtimes such as Cloudflare Workers forbid generating random values in global scope, so simply importing `chat()` crashed the Worker with `Disallowed operation called within global scope`.

The runtime id is now generated lazily on first use (inside `getAIDevtoolsRuntimeId()` / `createAIDevtoolsEventEnvelope()`) and memoized, so evaluating the module performs no random-value generation. The cross-bundle global (`globalThis.__TANSTACK_AI_DEVTOOLS_RUNTIME_ID__`) and the generated values are unchanged. Fixes #667.
