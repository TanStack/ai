---
'@tanstack/ai-persistence': minor
'@tanstack/ai': patch
---

Add an optional ActivityStore sidecar so server persistence can save and reconstruct AG-UI activity without putting it in MessageStore.

Activity saves are best-effort. They run after the message, run, and interrupt writes, so a failed activity save does not fail the run. `ActivityRecord` keeps the activity `metadata`. A paged `reconstructChat` puts each activity on the one page that holds it.
