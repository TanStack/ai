---
'@tanstack/ai-client': patch
---

A cancel now stops the request. `stop()` and an abort of the connection `options.signal` reach the fetch, XHR, `stream()`, and `rpcStream()` requests. A realtime `disconnect()` during `connect()` does not stop a pending `getToken()` or `adapter.connect()` call: it drops the late result and closes the connection that comes back. An abort of `options.signal` now ends the chat like `stop()`, not as a finished run. A realtime connection that a later `connect()` replaced no longer changes the status of the live session.
