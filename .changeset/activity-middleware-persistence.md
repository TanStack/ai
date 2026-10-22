---
'@tanstack/ai': patch
---

Apply `ACTIVITY_SNAPSHOT` and `ACTIVITY_DELTA` events that chat middleware adds to `ctx.activities`, so `withPersistence` saves them and `reconstructChat` restores their activity rows. A middleware that passes on an adapter activity event, or an exact copy of it, does not apply it twice.
