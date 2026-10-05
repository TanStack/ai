---
'@tanstack/ai-harness': patch
---

- A resolve that a crash interrupted now continues the interrupted turn after the restart. Before, it ran without the id of the interrupted run, so `chat()` refused it, and it lost the routed plan, the sender, and the context of that turn.
- On a host without a log, the transcript is saved before each model call. So when the model call after an approved tool fails, the result of that tool stays in the transcript.
