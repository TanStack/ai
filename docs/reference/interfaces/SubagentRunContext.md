---
id: SubagentRunContext
title: SubagentRunContext
---

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:16](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L16)

Context the library passes into [defineAgent](../functions/defineAgent.md) `run`.

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:18](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L18)

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

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:17](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L17)

***

### parentRunId

```ts
parentRunId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:27](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L27)

The run this child run continues. It is the parent chat run on the first
run, and the interrupted parent run on a resume. Pass it to the child
`chat()`.

***

### parentSubagentRunId?

```ts
optional parentSubagentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:36](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L36)

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:29](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L29)

Answers to this child's interrupts. Pass it to the child `chat()`.

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:21](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L21)

Run id for the child `chat()`.

***

### subagentRunId

```ts
subagentRunId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:35](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L35)

The child's AG-UI run id. Stays the same when an interrupted child
continues. Pass it to the child `chat()` so its middleware sees
`ctx.subagentRunId`.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:19](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L19)
