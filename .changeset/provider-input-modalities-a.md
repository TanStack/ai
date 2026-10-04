---
'@tanstack/ai-openai': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-mistral': patch
---

The text adapters set `inputModalities` from their model metadata, so a known model gives the input kinds it reads and an unknown model gives `undefined`.
