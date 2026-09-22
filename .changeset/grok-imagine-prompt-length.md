---
'@tanstack/ai-grok': patch
---

Stop rejecting Grok image prompts longer than 4000 characters. xAI does not document that cap for Imagine models, and the provider reports an over-long prompt itself.
