---
'@tanstack/ai-gemini': patch
---

Parse `usageMetadata` in the Gemini image adapter response so image generations report token usage (`inputTokens` / `outputTokens` / `totalTokens`) instead of always returning `usage: undefined`.
