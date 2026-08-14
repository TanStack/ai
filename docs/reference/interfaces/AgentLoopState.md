---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [packages/ai/src/types.ts:858](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L858)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/types.ts:864](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L864)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [packages/ai/src/types.ts:860](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L860)

Current iteration count (0-indexed). One iteration = one model turn.

***

### lastTurnToolCallCount

```ts
lastTurnToolCallCount: number;
```

Defined in: [packages/ai/src/types.ts:876](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L876)

Tool calls in the most recent batch — a live model turn or a
pending/resume batch (0 when the last phase produced no tool calls).

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/types.ts:862](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L862)

Current messages array

***

### toolCallCount

```ts
toolCallCount: number;
```

Defined in: [packages/ai/src/types.ts:871](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L871)

Cumulative tool calls counted so far in this run (model-emitted during the
agent loop, including ones skipped by middleware, and pending tools from
the inbound message list when resumed). Not a recount of full message
history; not model turns.
