---
'@tanstack/ai-openai': patch
---

`openaiCompatible`: stream reasoning from OpenAI-compatible providers. Reasoning models behind an OpenAI-compatible endpoint (DeepSeek, Qwen, GLM, Kimi, most vLLM/SGLang deployments) send their thinking on `delta.reasoning_content`, or `delta.reasoning` on some gateways — fields that are outside the OpenAI wire format. The generic adapter had no reasoning hook, so the thinking was dropped silently and the only workaround was to monkey-patch `extractReasoning` onto the prototype. It now reads both fields, matching what `@tanstack/ai-cloudflare`, `@tanstack/ai-byteplus` and `@tanstack/ai-groq` already do. Providers that send neither are unaffected.
