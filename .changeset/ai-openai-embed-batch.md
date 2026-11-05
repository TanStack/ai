---
'@tanstack/ai-openai': patch
---

`embed()` with the OpenAI adapter now sends inputs in sequential requests of at most 2048 inputs each, the endpoint's limit, and sums the token usage. Before, more than 2048 texts failed with a 400 error. OpenAI also limits one request to 300,000 tokens across all inputs, so a large array of long texts can still fail. Split those calls yourself.
