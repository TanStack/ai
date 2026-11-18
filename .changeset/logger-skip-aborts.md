---
'@tanstack/ai': patch
---

The `errors` debug category no longer logs a cancelled request. An abort or timeout error still rejects the call, but is not written as a fatal error by the activity or the adapter.
