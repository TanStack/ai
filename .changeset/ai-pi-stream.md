---
'@tanstack/ai-pi-stream': minor
---

Add `@tanstack/ai-pi-stream`. It converts between TanStack AI (AG-UI) events and pi agent events (`@earendil-works/pi-agent-core`), in both directions, with the message history.

- Put TanStack `useChat` in front of a pi agent with `fromPiAgentEvents(agentLoop(...), { threadId, runId })` and `toPiMessages`.
- Serve a pi UI from `chat()` with `fromPiMessages` and `toPiAgentEvents`.

Text, reasoning with its signature, tool calls and results, tool errors, usage and errors cross in both directions. Tool approvals, client tools and subagents do not.
