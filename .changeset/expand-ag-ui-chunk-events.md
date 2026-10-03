---
'@tanstack/ai': patch
'@tanstack/ai-client': patch
---

Read the AG-UI `TEXT_MESSAGE_CHUNK`, `TOOL_CALL_CHUNK`, and `REASONING_MESSAGE_CHUNK` events. A server can send one of these in place of the START / CONTENT / END events. The stream processor dropped them, so the text, the message id, and the metadata were lost. It now expands each chunk into those events, so both forms build the same message. A chunk with no id continues the open message or tool call. The next other event closes it, except `RAW`, `ACTIVITY_*`, `REASONING_ENCRYPTED_VALUE`, and subagent lifecycle events. A text or tool call chunk from a run that `clear()` dropped stays out of the chat, as the explicit events do.
