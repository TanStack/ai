---
'@tanstack/ai-mistral': patch
---

A Mistral response that stops with `finish_reason` `model_length` (the model's context window is exhausted) now reports `finishReason: 'length'` on `RUN_FINISHED` and `structuredOutput` reports it as a context-window truncation (shorten the prompt or use a larger-context model, not raise `max_tokens`). Before, a streamed `model_length` stop was reported as a normal `stop`, and `structuredOutput` surfaced a JSON parse error instead of the truncation error.
