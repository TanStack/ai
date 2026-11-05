---
'@tanstack/ai-anthropic': patch
---

Report `incomplete-stream` when an Anthropic stream ends before a stop reason (no `message_delta` with `stop_reason` and no `message_stop`). Before, the run had no terminal event and `onFinish` got the partial text as a success. An abort is not reported.
