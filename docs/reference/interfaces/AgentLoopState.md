---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [packages/ai/src/types.ts:767](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L767)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/types.ts:773](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L773)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [packages/ai/src/types.ts:769](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L769)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/types.ts:771](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L771)

Current messages array
