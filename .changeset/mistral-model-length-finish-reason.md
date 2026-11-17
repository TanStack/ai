---
'@tanstack/ai-mistral': patch
---

A Mistral response that stops with `finish_reason` `model_length` (the model's context window is exhausted) is now a `RUN_ERROR` with code `context_overflow`. `structuredOutput` throws the same code. Before, a streamed `model_length` stop was reported as a normal `stop`, and `structuredOutput` surfaced a JSON parse error.
