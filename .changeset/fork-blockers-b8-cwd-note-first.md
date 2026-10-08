---
'@tanstack/ai-harness': patch
---

A `cwd` change on a thread with no messages adds no note. Before, the note was the first message, with the assistant role. Some providers refuse a conversation that starts with an assistant message.
