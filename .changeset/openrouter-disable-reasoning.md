---
'@tanstack/ai-openrouter': patch
---

Preserve `reasoning: { enabled: false }` by normalizing it to the
SDK-supported `reasoning: { effort: 'none' }`, and omit empty reasoning
objects before request serialization.
