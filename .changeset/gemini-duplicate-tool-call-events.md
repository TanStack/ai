---
'@tanstack/ai-gemini': patch
---

Fix duplicate TOOL_CALL_START/TOOL_CALL_END events when a Gemini stream chunk carries both functionCall parts and finishReason UNEXPECTED_TOOL_CALL. The finish handler re-registered and re-emitted tool calls the per-part loop had already processed, which crashed the chat run with "Duplicate interrupt id in final batch".
