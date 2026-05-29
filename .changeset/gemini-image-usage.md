---
'@tanstack/ai-gemini': patch
---

Surface token usage from the Gemini image adapter's `generateContent` path
(e.g. Nano Banana) by parsing `usageMetadata` from the response instead of
omitting `usage`. The Imagen (`generateImages`) path is unchanged — that SDK
response type does not expose `usageMetadata`. Fixes #330.
