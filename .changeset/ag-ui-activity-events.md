---
'@tanstack/ai': minor
---

Process AG-UI `ACTIVITY_SNAPSHOT` and `ACTIVITY_DELTA` events into frontend-only `role: 'activity'` messages (`ActivityPart`). `ACTIVITY_DELTA` applies an RFC 6902 patch to the activity `content`. The model never gets activity as input.
