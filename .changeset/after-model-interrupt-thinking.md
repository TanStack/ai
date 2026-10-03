---
'@tanstack/ai': patch
---

Keep a turn's thinking when an `afterModel` generic interrupt pauses a turn that has no tool calls. Before, the interrupt's `MESSAGES_SNAPSHOT` kept only the assistant text, so the client lost the thinking and its signature (signed or redacted). A turn with thinking but no text was left out of the snapshot. The interrupt now records the turn the same way a finished run does.
