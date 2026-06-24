---
'@tanstack/ai-openrouter': minor
---

Forward per-system-prompt `cache_control` breakpoints to the wire. The text adapter previously collapsed `systemPrompts` to a plain joined string and dropped the object-form `metadata`, so Anthropic-family prompt caching over OpenRouter was unreachable. It now declares `OpenRouterSystemPromptMetadata` (narrowing `systemPrompts[i].metadata` so `cache_control` is typed and autocompleted at the `chat()` call site) and, when any system prompt carries `cache_control`, emits the system message as a content-array part carrying the directive — mirroring `@tanstack/ai-anthropic`. Callers without `cache_control` are unaffected: the system message is still sent as the same joined string.
