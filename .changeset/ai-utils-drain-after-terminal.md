---
'@tanstack/ai-utils': patch
---

Add `drainAfterTerminal`, which the OpenAI and OpenRouter Responses adapters use to let the body end by itself after a terminal event instead of cancelling a finished request.
