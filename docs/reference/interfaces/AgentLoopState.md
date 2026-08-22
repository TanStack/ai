---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [packages/ai/src/types.ts:866](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L866)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/types.ts:872](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L872)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [packages/ai/src/types.ts:868](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L868)

Current iteration count (0-indexed). One iteration = one model turn.

***

### lastTurnToolCallCount

```ts
lastTurnToolCallCount: number;
```

Defined in: [packages/ai/src/types.ts:884](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L884)

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

Defined in: [packages/ai/src/types.ts:870](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L870)

Current messages array

***

### toolCallCount

```ts
toolCallCount: number;
```

Defined in: [packages/ai/src/types.ts:879](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L879)

Cumulative tool calls counted so far in this run (model-emitted during the
agent loop, including ones skipped by middleware, and pending tools from
the inbound message list when resumed). Not a recount of full message
history; not model turns.
