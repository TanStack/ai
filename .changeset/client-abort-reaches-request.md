---
'@tanstack/ai-client': patch
---

`stop()` no longer waits for a client tool that never settles. Fetch and XHR connection adapters now abort on the client's signal and on your own `options.signal`. `stream()` and `rpcStream()` end on abort even if the source ignores the signal. `RealtimeClient.disconnect()` during `connect()` or a token refresh no longer leaves a connection or a token refresh timer behind.
