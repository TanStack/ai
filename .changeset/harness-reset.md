---
'@tanstack/ai-harness': minor
---

`session.reset(note?)` starts a fresh model context and keeps the transcript.

- From the next turn, the model sees only the note (when given) and what comes after the reset. `transcript()` keeps every message, plus a marker message with `metadata.harness.reset`. The session view shows the marker as a notice.
- A reset is an input: it runs once per `inputId`, and it waits for a running turn to end. While the thread waits for interrupts, it is refused with `pending_interrupts`.
- Clients send `{ op: 'reset', note }` or call `client.reset(note)`. A `harness.reset` event fires when it applies.
