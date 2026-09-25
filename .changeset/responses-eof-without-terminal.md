---
'@tanstack/openai-base': patch
'@tanstack/ai-openrouter': patch
---

Report `RUN_ERROR` (code `incomplete-stream`) when an OpenAI or OpenRouter Responses stream ends before `response.completed`. Before, the adapter sent a made-up `RUN_FINISHED` with `finishReason: 'stop'`, so a cut-off answer looked like a successful run and middleware `onFinish` ran. The partial text is still streamed to the caller.
