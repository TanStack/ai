---
id: runAgentStream
title: runAgentStream
---

```ts
function runAgentStream(
   agent, 
   input, 
   sink?, 
   parentToolCallId?, 
binding?): AsyncIterable<AGUIEvent>;
```

Defined in: [packages/ai/src/activities/chat/agents/spawn.ts:732](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/spawn.ts#L732)

Run one agent and stream its chunks, from `SUBAGENT_STARTED` to
`SUBAGENT_FINISHED` or `SUBAGENT_ERROR`. The package root exports this
as `runAgentStream`. The caller checks `ctx.input` against
`agent.inputSchema` first. Pass `createSubagentSink()` to keep the
child's interrupt objects and token usage. The finished event carries
`interruptIds` only.

## Parameters

### agent

[`DefinedAgent`](../interfaces/DefinedAgent.md)

### input

[`SubagentRunInput`](../interfaces/SubagentRunInput.md)

### sink?

[`SubagentSink`](../interfaces/SubagentSink.md)

### parentToolCallId?

`string`

### binding?

[`SubagentBinding`](../interfaces/SubagentBinding.md)

## Returns

`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md)\>
