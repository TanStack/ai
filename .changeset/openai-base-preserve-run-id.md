---
'@tanstack/openai-base': patch
---

Chat Completions streams keep the `runId` you pass to `chat()`. `RUN_STARTED` and `RUN_FINISHED` use that id, including a later tool-loop finish. When you omit `runId`, the adapter still creates one.
