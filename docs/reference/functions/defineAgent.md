---
id: defineAgent
title: defineAgent
---

```ts
function defineAgent<TName, TTools, TSchema, TInterrupts>(agent): DefinedAgent<TName, TTools, TSchema, TInterrupts>;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:100](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L100)

Define a named child agent. Pass the same object to `chat({ subagents })`.
Pass the agents array to `useChat({ subagents })` when you render parts
yourself. The hook uses it for types only. It does not call `run`.

## Type Parameters

### TName

`TName` *extends* `string`

### TTools

`TTools` *extends* readonly `SubagentTool`[] = readonly \[\]

### TSchema

`TSchema` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) \| `undefined` = `undefined`

### TInterrupts

`TInterrupts` *extends* readonly [`InterruptDefinition`](../interfaces/InterruptDefinition.md)\<`any`, `any`, `any`, `any`, `any`\>[] = readonly \[\]

## Parameters

### agent

[`DefinedAgent`](../interfaces/DefinedAgent.md)\<`TName`, `TTools`, `TSchema`, `TInterrupts`\>

## Returns

[`DefinedAgent`](../interfaces/DefinedAgent.md)\<`TName`, `TTools`, `TSchema`, `TInterrupts`\>

## Example

```ts
const researcher = defineAgent({
  name: 'researcher',
  description: 'Looks up facts',
  run: (ctx) =>
    chat({
      adapter: openaiText('gpt-5.6'),
      messages: ctx.messages,
      threadId: ctx.threadId,
      runId: ctx.runId,
      parentRunId: ctx.parentRunId,
      subagentRunId: ctx.subagentRunId,
      resume: ctx.resume,
    }),
})
```
