---
'@tanstack/ai-gemini': patch
---

Fix 400 error when sending tool results to Gemini API by removing redundant text part from functionResponse messages. Newer models (gemini-3.1-flash-lite, gemma-4) reject messages that mix text and functionResponse parts.
