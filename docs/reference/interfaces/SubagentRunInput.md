---
id: SubagentRunInput
title: SubagentRunInput
---

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:20](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L20)

What the library knows about a child run before `run` starts.
`TInput` is the agent's `inputSchema`.

## Type Parameters

### TInput

`TInput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) \| `undefined` = `any`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:29](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L29)

***

### input

```ts
input: TInput extends SchemaInput ? InferSchemaType<TInput> : undefined;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:27](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L27)

The input the parent model or the router gave this child, checked
against `inputSchema`. `undefined` when the agent has no `inputSchema`.

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

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:28](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L28)

***

### parentRunId

```ts
parentRunId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:38](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L38)

The run this child run continues. It is the parent chat run on the first
run, and the interrupted parent run on a resume. Pass it to the child
`chat()`.

***

### parentSubagentRunId?

```ts
optional parentSubagentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:48](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L48)

The subagentRunId of the child that started this one, for a nested child.

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:40](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L40)

Answers to this child's interrupts. Pass it to the child `chat()`.

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:32](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L32)

Run id for the child `chat()`.

***

### subagentRunId

```ts
subagentRunId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:46](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L46)

The child's AG-UI run id. Stays the same when an interrupted child
continues. Pass it to the child `chat()` so its middleware sees
`ctx.subagentRunId`.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:30](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L30)
