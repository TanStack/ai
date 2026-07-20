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

Current iteration count (0-indexed)

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
