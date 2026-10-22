---
id: SubagentForward
title: SubagentForward
---

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:25](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L25)

The fields a child `chat()` needs, in one spread:
`chat({ adapter, messages, ...ctx.forward })`.

## Properties

### abortController

```ts
abortController: AbortController;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:36](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L36)

Aborts when the parent run or the subagent group stops.

***

### parentRunId

```ts
parentRunId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:28](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L28)

***

### parentSubagentRunId?

```ts
optional parentSubagentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:33](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L33)

The subagentRunId of the child that started this one, for a nested child.

***

### promptCache?

```ts
optional promptCache?: PromptCacheRetention;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:38](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L38)

The prompt cache retention of the parent call, when it has one.

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:34](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L34)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:27](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L27)

***

### subagentName

```ts
subagentName: string;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:31](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L31)

The agent name. Middleware reads it as `ctx.subagentName`.

***

### subagentRunId

```ts
subagentRunId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:29](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L29)

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:26](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L26)
