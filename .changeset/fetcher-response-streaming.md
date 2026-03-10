---
'@tanstack/ai-client': minor
---

feat: support server function Response streaming via fetcher

Generation fetchers can now return a `Response` with an SSE body (e.g., from a TanStack Start server function using `toServerSentEventsResponse()`). When a `Response` is returned, `GenerationClient` and `VideoGenerationClient` automatically parse it as an SSE stream while preserving full type safety on the input.
