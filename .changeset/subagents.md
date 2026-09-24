---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-devtools-core': patch
---

Add first-class subagents. `chat({ subagents })` starts named child agents (router spawn, or a synthetic tool when there is no router). The stream emits AG-UI `SUBAGENT_*` events with `subagentRunId`. The client stores nested `type: 'subagent'` parts. `useChat().subagents` and `part.subagent` are the same live handle, including `stop()`.

In the React chat UI kit, pass the same agents to `options.subagents` that you pass to `chat()`. A subagent card can style its own child's parts: `<Parts partsComponents={...} toolsComponents={...} />`. Each entry replaces the root entry of the same key for that card and its nested children. Keys you do not set use the root widgets. The card's tool names, tool `input` and `output`, and approvals are typed from that agent's `tools`. The root `interruptsComponents` also accepts the children's approval tools and `interrupts`.

Pass the same `defineAgent` list to `useChat({ subagents })` when you are not using the chat UI factory. `part.subagent.name` narrows to those names, and that child's message parts use the agent's tools.

A child card keeps all of the child's work: text, reasoning, tool calls, tool results, approvals, and nested children. A child can stop for an approval or a client tool. Its `SUBAGENT_FINISHED` has `outcome: { type: 'suspended' }`, and the parent run ends with that interrupt. The resume continues the same child. Pass `parentRunId: ctx.parentRunId` and `resume: ctx.resume` to the child `chat()`.

The AI devtools Conversation tab shows each subagent as a card of steps, drawn like the parent's steps. The steps are the child's server iterations when server events reach the devtools, else they come from the browser messages. The User view shows the child's text and tool outputs. Nested children show the same way. The child's card updates while it streams, and a later turn keeps the earlier turns.

Child token usage is added to the parent `RUN_FINISHED.usage[]`. Child messages travel on the AG-UI wire as their own messages, tagged with `subagentRunId`.

`@tanstack/ai` now depends on `@ag-ui/core` 1.0.0. Subagent events come from that package.

AG-UI `{ type: 'file' }` content sources now cross the wire as `ContentPartFileSource`. No adapter reads them yet, so `chat()` throws before it calls the adapter.

`RUN_FINISHED.usage[]` now carries `cacheWriteInputTokens`. `metadata.tanstack.usage` still carries `promptTokensDetails.cacheWriteTokens`, so older readers see the same usage as before.

`chat({ subagentRunId })` puts that id on the middleware context as `ctx.subagentRunId`. A child `chat()` passes `subagentRunId: ctx.subagentRunId`, so a middleware inside the child knows it runs as a subagent and which card it belongs to. The field is absent on a top-level run.

`fromSpecTokenUsage` adds every entry of `RUN_FINISHED.usage[]`. Before, it read only the first entry. A run with more than one usage entry now reports the total.
