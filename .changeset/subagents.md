---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
---

Add first-class subagents. `chat({ subagents })` starts named child agents (router spawn, or a synthetic tool when there is no router). The stream emits AG-UI `SUBAGENT_*` events with `subagentRunId`. The client stores nested `type: 'subagent'` parts. `useChat().subagents` and `part.subagent` are the same live handle, including `stop()`.
