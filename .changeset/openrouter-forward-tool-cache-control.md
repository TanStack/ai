---
'@tanstack/ai-openrouter': patch
---

Forward tool-definition `cacheControl` through the OpenRouter function-tool converter so Anthropic prompt caching of tool definitions works over OpenRouter. Previously `metadata.cacheControl` was dropped before serialization, so the cache breakpoint never reached the wire. The OpenRouter SDK already accepts `cacheControl` on a function tool and remaps it to `cache_control`; this mirrors `convertCustomToolToAdapterFormat` in `@tanstack/ai-anthropic`.
