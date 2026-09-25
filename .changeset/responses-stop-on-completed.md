---
'@tanstack/openai-base': patch
---

Stop reading an OpenAI Responses stream after `response.completed`. Before, `chat()` and `structuredOutputStream` waited for the HTTP body to close, so a body that stayed open delayed `RUN_FINISHED`. The adapter now finishes on the terminal event and releases the upstream reader.
