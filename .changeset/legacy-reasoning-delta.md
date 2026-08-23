---
'@tanstack/openai-base': patch
---

Map the legacy `response.reasoning.delta` Responses event as an alias of `response.reasoning_text.delta`. The old event name was removed from the OpenAI spec in July 2025, but OpenAI-compatible providers frozen on the older spec (such as Amazon Bedrock's Mantle endpoint serving Gemma) still emit it; their reasoning was silently dropped.
