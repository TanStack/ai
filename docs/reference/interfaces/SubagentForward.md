---
id: SubagentForward
title: SubagentForward
---

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:95](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L95)

The fields a child `chat()` needs, in one spread:
`chat({ adapter, messages, ...ctx.forward })`.

## Properties

### abortController

```ts
abortController: AbortController;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:106](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L106)

Aborts when the parent run or the subagent group stops.

***

### parentRunId

```ts
parentRunId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:98](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L98)

***

### parentSubagentRunId?

```ts
optional parentSubagentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:103](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L103)

The subagentRunId of the child that started this one, for a nested child.

***

### promptCache?

```ts
optional promptCache?: PromptCacheRetention;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:108](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L108)

The prompt cache retention of the parent call, when it has one.

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:104](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L104)

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:97](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L97)

***

### subagentName

```ts
subagentName: string;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:101](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L101)

The agent name. Middleware reads it as `ctx.subagentName`.

***

### subagentRunId

```ts
subagentRunId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:99](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L99)

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:96](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L96)
