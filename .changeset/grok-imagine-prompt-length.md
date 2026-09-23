---
'@tanstack/ai-grok': minor
---

Stop rejecting Grok image prompts longer than 4000 characters. Remove `grok-2-image-1212`. xAI retired that model on 2026-02-24, and the image API returns 404 for it. Use `grok-imagine-image`, `grok-imagine-image-2.0`, or `grok-imagine-image-quality`.
