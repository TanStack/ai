---
'@tanstack/ai-harness': patch
---

`session.revert()` and `session.unrevert()` keep your own file edits. A revert puts back only the files that the hidden turns changed. `unrevert()` puts these files back as they were when the revert started. A prompt that arrives during a revert waits until it ends. A note that arrives while a revert stands goes after the next prompt or `unrevert()`. `/undo` and `/redo` refuse while a revert stands.
