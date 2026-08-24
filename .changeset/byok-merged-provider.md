---
'@tanstack/ai-client': patch
---

Resolve BYOK request headers from the merged send body `provider`. A per-call `sendOptions.body.provider` now selects the same key as the wire `forwardedProps`.
