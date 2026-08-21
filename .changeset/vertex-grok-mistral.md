---
'@tanstack/ai-grok': minor
'@tanstack/ai-mistral': minor
'@tanstack/ai-anthropic': minor
---

Add Vertex AI factories for Grok (`grokVertexText`, `grokVertexSummarize`)
and Mistral (`mistralVertexText`) on `@tanstack/ai-grok/vertex` and
`@tanstack/ai-mistral/vertex`. Vertex factories accept only the chat
models in the Google partner catalog. `anthropicVertexText` now uses
the same Vertex Claude catalog.
