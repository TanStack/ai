---
'@tanstack/openai-base': patch
'@tanstack/ai-openai': patch
'@tanstack/ai-groq': patch
'@tanstack/ai-llmgateway': patch
'@tanstack/ai-byteplus': patch
---

Chat Completions adapters skip a stream chunk that has no `choices` field, as some gateways send for the usage trailer. Before, the run failed with `Cannot read properties of undefined (reading '0')`.
