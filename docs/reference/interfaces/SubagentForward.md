---
id: SubagentForward
title: SubagentForward
---

Defined in: packages/ai/src/activities/chat/agents/bound.ts:25

The fields a child `chat()` needs, in one spread:
`chat({ adapter, messages, ...ctx.forward })`.

## Properties

### abortController

```ts
abortController: AbortController;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:36

Aborts when the parent run or the subagent group stops.

***

### parentRunId

```ts
parentRunId: string;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:28

***

### parentSubagentRunId?

```ts
optional parentSubagentRunId?: string;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:33

The subagentRunId of the child that started this one, for a nested child.

***

### promptCache?

```ts
optional promptCache?: PromptCacheRetention;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:38

The prompt cache retention of the parent call, when it has one.

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:34

***

### runId

```ts
runId: string;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:27

***

### subagentName

```ts
subagentName: string;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:31

The agent name. Middleware reads it as `ctx.subagentName`.

***

### subagentRunId

```ts
subagentRunId: string;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:29

***

### threadId

```ts
threadId: string;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:26
