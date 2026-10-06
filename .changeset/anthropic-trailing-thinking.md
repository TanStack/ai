---
'@tanstack/ai-anthropic': patch
---

Do not end a request in an assistant message that holds only thinking. Claude rejects it with `The final block in an assistant message cannot be thinking`. This happened when a run resumed after an `afterModel` interrupt paused a turn with thinking but no text. The adapter now leaves that message out, and Claude answers again.
