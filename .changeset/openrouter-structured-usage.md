---
'@tanstack/ai-openrouter': patch
'@tanstack/openai-base': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-bedrock': patch
---

fix: populate StructuredOutputResult.usage from non-stream structuredOutput()

Adapters that already returned tokens/cost on streaming structured paths were dropping response.usage on the non-stream structuredOutput() method. OpenRouter now forwards tokens and cost; openai-base, Mistral, and Bedrock Converse do the same for tokens so fallbackStructuredOutputStream and middleware can observe usage.
