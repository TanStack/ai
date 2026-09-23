---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
---

Add first-class subagents. `chat({ subagents })` starts named child agents (router spawn, or a synthetic tool when there is no router). The stream emits AG-UI `SUBAGENT_*` events with `subagentRunId`. The client stores nested `type: 'subagent'` parts. `useChat().subagents` and `part.subagent` are the same live handle, including `stop()`.

Pass the same `defineAgent` list to `useChat({ subagents })` when you are not using the chat UI factory. `part.subagent.name` narrows to those names, and that child's message parts use the agent's tools.

`@tanstack/ai` now depends on `@ag-ui/core` 1.0.0. Subagent events come from that package.
