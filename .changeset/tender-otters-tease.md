---
'@tanstack/ai': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-bedrock': patch
'@tanstack/ai-fal': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-groq': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-openrouter': patch
---

fix: resolve dangling relative imports in published declaration files

Switch directory-barrel imports (`../utils`, `../tools`, `../middleware`) to
concrete module paths so emitted `.d.ts` specifiers resolve under
`bundler`/`node16`/`nodenext` resolution. Adds a `test:dts` scanner guardrail.

Fixes #920
