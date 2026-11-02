---
'@tanstack/ai-groq': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-mistral': patch
---

Fix the README usage examples: they imported `generate` (and `generateImages` for Grok) from `@tanstack/ai`, which do not exist. They now use `chat({ stream: false })` and `generateImage`.
