---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [packages/ai/src/types.ts:750](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L750)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/types.ts:756](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L756)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [packages/ai/src/types.ts:752](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L752)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/types.ts:754](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L754)

Current messages array
