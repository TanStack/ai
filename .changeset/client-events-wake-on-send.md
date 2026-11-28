---
'@tanstack/ai-harness': patch
---

`createHarnessClient`: an input that the client sends ends the wait of `events()` before it connects again. On a new thread, `events()` gets `404` until the first message, and its waits grow up to 30 s. The first turn then did not stream: its text came all at once when the stream connected again after the turn.
