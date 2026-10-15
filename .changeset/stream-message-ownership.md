---
'@tanstack/ai': patch
---

File each model call on its own assistant message. Reasoning that arrives before the call's text id, a tool call whose parent id is new, and a signature that names an earlier step stay on the message that owns them.
