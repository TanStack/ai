---
'@tanstack/ai-ollama': patch
---

Report `finishReason: 'length'` on `RUN_FINISHED` when an Ollama streaming response is cut off by `num_predict` or the context limit (`done_reason: 'length'`). It was reported as `'stop'`, like a complete answer. This matches the OpenAI-compatible and Mistral adapters.
