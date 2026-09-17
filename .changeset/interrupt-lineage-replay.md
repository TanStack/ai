---
'@tanstack/ai-client': patch
---

Fix resolved interrupts reappearing as pending when a fresh `ChatClient` replays saved events. The client follows `parentRunId` links and clears stale pauses after a continuation ends without an interrupt. This also works when parent links arrive after terminal events. Intermediate `tool_calls` events do not mark the run or its ancestors as answered.
