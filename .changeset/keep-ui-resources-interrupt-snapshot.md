---
'@tanstack/ai': patch
---

fix(chat): keep ui-resource parts emitted during the current run on the interrupt MESSAGES_SNAPSHOT. Server tools emitting `ui://` widgets via `ctx.emitCustomEvent('ui-resource', ...)` now have the resource recorded on the tool-call anchor ModelMessage, so the MESSAGES_SNAPSHOT emitted when the run pauses on a client tool no longer drops the widget from client state (#1397).
