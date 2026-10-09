---
'@tanstack/ai-harness': patch
'@tanstack/ai-persistence': patch
---

Child session entries now get the harness of their parent thread. So `GET sessions?parentThreadId=` lists the subagent and agent run children of a thread.
