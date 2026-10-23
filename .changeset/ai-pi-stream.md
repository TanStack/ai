---
'@tanstack/ai-pi-stream': minor
---

Add `@tanstack/ai-pi-stream`. It converts between TanStack AI (AG-UI) events and pi agent events (`@earendil-works/pi-agent-core`), in both directions, with the message history.

- Put TanStack `useChat` in front of a pi agent with `runPiAgent(await chatParamsFromRequest(request), { config, streamFn, tools })`. pi tools in `needsApproval` pause for a `useChat` approval, and the client tools of `useChat` run in the browser. For a hand-run `agentLoop()`, use `fromPiAgentEvents` and `toPiMessages`.
- Serve a pi UI from `chat()` with `chatParamsFromPiRequest` and `toPiAgentEvents`. Approvals and other interrupts arrive as `tanstack-interrupt` pi messages and go back as `resume`. State, activity, custom and subagent events arrive as `tanstack-event` pi messages.

Text, reasoning and redacted reasoning with signatures, tool calls and results with images, tool errors and progress, usage and cost, and errors cross in both directions. What one side cannot hold does not cross: image URLs, audio, video and documents sent to pi, and structured output and subagents from pi.
