---
'@tanstack/ai-anthropic': patch
'@tanstack/ai-bedrock': patch
'@tanstack/ai-byteplus': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-groq': patch
'@tanstack/ai-llmgateway': patch
'@tanstack/ai-lovable': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-openai': patch
'@tanstack/ai-vercel-gateway': patch
---

Stop requiring Zod as a peer dependency when the adapters do not import it at runtime.
