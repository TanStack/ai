---
'@tanstack/ai': patch
---

`WebSocketLike` has an optional `bufferedAmount`. A server can read it to stop sending to a slow socket. A socket without it works as before.
