---
'@tanstack/ai-react': patch
---

Update messagesRef synchronously during render instead of in useEffect to prevent stale messages when ChatClient is recreated
