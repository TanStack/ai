---
'@tanstack/ai-openai': patch
---

The default realtime model for `openaiRealtimeToken()` and `openaiRealtime()` is now `gpt-realtime-2.1`, the latest snapshot in `OpenAIRealtimeModel`. Pass `model` explicitly to pin an older snapshot (`gpt-realtime`, `gpt-realtime-1.5`, `gpt-realtime-2`, or their `-mini` variants).
