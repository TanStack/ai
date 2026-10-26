---
'@tanstack/ai-anthropic': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-groq': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-openai': patch
'@tanstack/ai-openrouter': patch
---

Model metadata no longer carries prices. Nothing read them, and prices change faster than a package release. To price a call, read the live rate card from modelschemas: see the Model Prices guide.
