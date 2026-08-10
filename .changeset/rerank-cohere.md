---
'@tanstack/ai': minor
'@tanstack/ai-event-client': minor
'@tanstack/ai-cohere': minor
---

feat: add `rerank()` activity for reordering documents by relevance to a query

Adds a provider-agnostic `rerank()` activity (with `createRerankOptions`, the
`RerankAdapter` interface, and `BaseRerankAdapter`). Documents may be strings
or JSON-serializable objects — object documents are serialized for the
provider and the original element is returned in the result, fully typed.
Supports `topN`, per-request cancellation via `abortSignal`, and the standard
observe-only `GenerationMiddleware` (`onStart`/`onUsage`/`onFinish`/`onAbort`/
`onError`) plus `rerank:*` devtools events. Rerank bills in provider-defined
search units, surfaced on `usage.unitsBilled`.

The first adapter ships in the new `@tanstack/ai-cohere` package as
`cohereRerank` / `createCohereRerank`.
