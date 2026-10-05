---
'@tanstack/ai': patch
---

Do not record an `execute_tool` span for a client tool in `otelMiddleware`. Middleware now sees a client tool's input before dispatch, so the middleware opened a span for a tool that the server does not run. A client tool runs in the client, so the server records only the chat and iteration spans, as before.
