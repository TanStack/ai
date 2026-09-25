---
'@tanstack/ai-openrouter': patch
---

Respect `modelOptions.streamOptions: { includeUsage: false }`. The adapter no longer sends `stream_options` in that case, for chat streams and structured output streams. This lets you stream with OpenRouter `provider.requireParameters: true`.
