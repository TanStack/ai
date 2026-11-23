---
'@tanstack/ai-gemini': patch
---

End a Gemini stream that finishes with `MALFORMED_FUNCTION_CALL` or `LANGUAGE` with a `RUN_ERROR` instead of a `RUN_FINISHED` with `stop`, so an agent no longer stops silently with no output or tool call.
