---
'@tanstack/ai': patch
---

Log durability replay failures on the SSE and NDJSON transports. When a reconnect or a `resumeServerSentEventsResponse` / `resumeHttpResponse` join fails to replay (for example, an unknown or expired `memoryStream` run), the failure is now logged under the `errors` category, as the WebSocket resume already does. The reader still receives the same `RUN_ERROR`.
