---
'@tanstack/ai-gemini': patch
---

Report `truncated-stream` when a Gemini chat stream ends without a `finishReason`. Before, the run had no terminal event and `onFinish` got the partial text as a success. The adapter now closes the open tool calls, reasoning, and text, then emits `RUN_ERROR`. Structured output already reported this case. An abort is not reported.
