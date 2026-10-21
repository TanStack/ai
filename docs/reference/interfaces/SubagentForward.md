---
id: SubagentForward
title: SubagentForward
---

Defined in: packages/ai/src/activities/chat/agents/bound.ts:88

The fields a child `chat()` needs, in one spread:
`chat({ adapter, messages, ...ctx.forward })`.

## Properties

### abortController

```ts
abortController: AbortController;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:99

Aborts when the parent run or the subagent group stops.

***

### parentRunId

```ts
parentRunId: string;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:91

***

### parentSubagentRunId?

```ts
optional parentSubagentRunId?: string;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:96

The subagentRunId of the child that started this one, for a nested child.

***

### promptCache?

```ts
optional promptCache?: PromptCacheRetention;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:101

The prompt cache retention of the parent call, when it has one.

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:97

***

### runId

```ts
runId: string;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:90

***

### subagentName

```ts
subagentName: string;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:94

The agent name. Middleware reads it as `ctx.subagentName`.

***

### subagentRunId

```ts
subagentRunId: string;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:92

***

### threadId

```ts
threadId: string;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:89
