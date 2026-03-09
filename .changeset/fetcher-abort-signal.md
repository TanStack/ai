---
'@tanstack/ai-client': patch
'@tanstack/ai-react': patch
'@tanstack/ai-solid': patch
'@tanstack/ai-vue': patch
'@tanstack/ai-svelte': patch
---

feat: pass abort signal to generation fetchers and extract GenerationFetcher utility type

- Generation clients now forward an `AbortSignal` to fetcher functions via an optional `options` parameter, enabling cancellation support when `stop()` is called
- Introduced `GenerationFetcher<TInput, TResult>` utility type in `@tanstack/ai-client` to centralize the fetcher function signature across all framework integrations
- All framework hooks/composables (React, Solid, Vue, Svelte) now use the shared `GenerationFetcher` type instead of inline definitions
