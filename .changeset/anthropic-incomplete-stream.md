---
'@tanstack/ai-anthropic': patch
---

Report `incomplete-stream` when an Anthropic stream ends before `message_delta` or `message_stop`. Before, the run had no terminal event and `onFinish` got the partial text as a success. An abort is not reported.
