---
'@tanstack/ai-groq': patch
'@tanstack/ai-byteplus': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-llmgateway': patch
---

The text adapters set `inputModalities` from their model metadata, so a known model gives the input kinds it reads and an unknown model gives `undefined`.
