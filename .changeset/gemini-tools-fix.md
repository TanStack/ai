---
'@tanstack/ai-gemini': patch
'@tanstack/ai': patch
---

Fix Gemini adapter tool call handling: preserve thoughtSignature for Gemini 3+ thinking models through the tool call lifecycle, use correct function name (instead of call ID) in functionResponse parts, and include the call ID in both functionCall and functionResponse for proper correlation.
