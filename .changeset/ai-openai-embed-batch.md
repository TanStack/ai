---
'@tanstack/ai-openai': patch
---

`embed()` with the OpenAI adapter now sends inputs in requests of at most 2048, the endpoint's limit. Before, more than 2048 texts failed with a 400 error.
