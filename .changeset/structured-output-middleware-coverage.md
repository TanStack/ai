---
'@tanstack/ai': minor
---

Middleware now wraps the final structured-output provider call in `chat({ outputSchema })` (both Promise<T> and streaming variants). Closes #390.

**New public surface:**

- `ChatMiddlewarePhase` gains a `'structuredOutput'` value, set on `ChatMiddlewareContext` for the duration of the final structured-output adapter call.
- New optional `ChatMiddleware.onStructuredOutputConfig` hook receives a `StructuredOutputMiddlewareConfig` (including the JSON Schema being sent to the provider) and can return a partial to transform the config before the final call.
- New exported type `StructuredOutputMiddlewareConfig` extends `ChatMiddlewareConfig` with `outputSchema: JSONSchema`.

**Behavior change for existing middleware:**

- `onChunk` now observes chunks from the final structured-output call. Phase-aware middleware can branch on `ctx.phase === 'structuredOutput'` to opt out: `if (ctx.phase === 'structuredOutput') return`.
- `onFinish` fires once at the end of the whole `chat()` invocation, after finalization completes — not after the agent loop.

**Internal cleanup:**

- The previous `RUN_STARTED`/`RUN_FINISHED` suppression hack in `runStreamingStructuredOutput` is removed; the engine now emits exactly one outer pair around the whole run.
