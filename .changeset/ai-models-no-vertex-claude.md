---
'@tanstack/ai-models': patch
---

Leave the Claude models out of the `google-vertex` catalog. They had the Gemini wire (`api: 'google-vertex'`), which the Gemini adapter cannot call. Use `anthropicVertexText` from `@tanstack/ai-anthropic/vertex` for Claude on Vertex.
