---
'@tanstack/ai-anthropic': patch
---

Forward top-level `cache_control` from `modelOptions` in the Anthropic text adapter.

Anthropic's Messages API accepts `cache_control` as a request-level parameter (it auto-places the cache breakpoint on the last cacheable block), but the adapter's `modelOptions` allowlist omitted it, so any value passed was silently stripped and logged as a dropped key. Per-block caching via `systemPrompts[].metadata.cache_control` is unchanged.
