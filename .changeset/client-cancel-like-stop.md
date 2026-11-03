---
'@tanstack/ai-client': patch
---

A cancel now stops the request. `stop()`, an abort of the connection `options.signal`, and `disconnect()` reach the fetch, XHR, `stream()`, and `rpcStream()` requests and the realtime connect. An abort of `options.signal` now ends the chat like `stop()`, not as a finished run. A realtime connection that a later `connect()` replaced no longer changes the status of the live session.
