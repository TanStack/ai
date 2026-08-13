---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [packages/ai/src/types.ts:833](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L833)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/types.ts:839](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L839)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [packages/ai/src/types.ts:835](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L835)

Current iteration count (0-indexed). One iteration = one model turn.

***

### lastTurnToolCallCount

```ts
lastTurnToolCallCount: number;
```

Defined in: [packages/ai/src/types.ts:851](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L851)

Tool calls in the most recent budgeted batch — a live model turn or a
pending/resume batch (0 when the last phase produced no tool calls).

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/types.ts:837](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L837)

Current messages array

***

### toolCallCount

```ts
toolCallCount: number;
```

Defined in: [packages/ai/src/types.ts:846](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L846)

Cumulative tool calls counted so far in this run (model-emitted during the
agent loop, including ones skipped by middleware, and pending tools from
the inbound message list when resumed). Not a recount of full message
history; not model turns.
