---
'@tanstack/ai-client': minor
---

Reconnects of a durable run can ride out a server restart. The wait between reconnects now doubles from `initialDelayMs` (default 250) up to `maxDelayMs` (default 5000), with jitter. Set `budgetMs` to keep reconnecting for a total time instead of a fixed number of attempts. A reconnect answered 408, 429, 502, 503, or 504 is retried, and a `Retry-After` header sets the wait. `delayMs` still works as the old name of `initialDelayMs`.
