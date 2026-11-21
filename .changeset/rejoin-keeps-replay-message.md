---
'@tanstack/ai-client': patch
---

Rejoining a run no longer loses the answer when the replay starts with reasoning. A reasoning start event that carries metadata, which `chat()` adds to every adapter event, already creates the replay's assistant message. The client used to drop that message at the first rebuild event. It now drops only the assistant message it hydrated before the replay. A second rejoin of the same run, after the view left and came back, no longer loses the replayed reasoning and tool calls. The client now resets the processor's stream state before each replay.
