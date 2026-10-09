---
'@tanstack/ai': patch
---

Fix a server tool call that the next turn sent twice when you use `withPersistence`. When a model call starts with a tool call and no text (often after thinking), `StreamProcessor` gave that message the id of the next model call. The next turn then replaced the stored answer with a copy that also held the tool call, so the provider got the same `tool_use` twice. The client now keeps the id of the message the tool call belongs to.
