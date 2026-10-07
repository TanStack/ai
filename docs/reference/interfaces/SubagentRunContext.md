---
id: SubagentRunContext
title: SubagentRunContext
---

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:18](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L18)

Context the library passes into [defineAgent](../functions/defineAgent.md) `run`.
`TInput` is the agent's `inputSchema`.

## Type Parameters

### TInput

`TInput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) \| `undefined` = `any`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:27](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L27)

***

### input

```ts
input: TInput extends SchemaInput ? InferSchemaType<TInput> : undefined;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:25](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L25)

The input the parent model wrote for this child, checked against
`inputSchema`. `undefined` when the agent has no `inputSchema`.

***

### messages

```ts
messages: (
  | UIMessage<unknown>
  | ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>)[];
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:26](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L26)

***

### parentRunId

```ts
parentRunId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:36](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L36)

The run this child run continues. It is the parent chat run on the first
run, and the interrupted parent run on a resume. Pass it to the child
`chat()`.

***

### parentSubagentRunId?

```ts
optional parentSubagentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:45](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L45)

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:38](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L38)

Answers to this child's interrupts. Pass it to the child `chat()`.

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:30](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L30)

Run id for the child `chat()`.

***

### subagentRunId

```ts
subagentRunId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:44](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L44)

The child's AG-UI run id. Stays the same when an interrupted child
continues. Pass it to the child `chat()` so its middleware sees
`ctx.subagentRunId`.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:28](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L28)
