---
'@tanstack/ai': patch
---

Emit a final text delta for streamed transcriptions when the adapter does not provide `transcribeStream`. Report startup cancellation through middleware `onAbort`.
