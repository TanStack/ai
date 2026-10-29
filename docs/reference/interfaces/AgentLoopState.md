---
id: AgentLoopState
title: AgentLoopState
---

Defined in: [packages/ai/src/types.ts:1248](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1248)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/types.ts:1254](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1254)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [packages/ai/src/types.ts:1250](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1250)

Current iteration count (0-indexed). One iteration = one model turn.

***

### lastTurnToolCallCount

```ts
lastTurnToolCallCount: number;
```

Defined in: [packages/ai/src/types.ts:1266](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1266)

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

Defined in: [packages/ai/src/types.ts:1252](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1252)

Current messages array

***

### toolCallCount

```ts
toolCallCount: number;
```

Defined in: [packages/ai/src/types.ts:1261](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1261)

Cumulative tool calls counted so far in this run (model-emitted during the
agent loop, including ones skipped by middleware, and pending tools from
the inbound message list when resumed). Not a recount of full message
history; not model turns.
