---
"@tanstack/ai-openai": patch
---

`openaiCompatible` and `openaiCompatibleText` accept the OpenAI SDK token-provider `apiKey` (`() => Promise<string>`), so Azure Entra and rotating keys type-check.
