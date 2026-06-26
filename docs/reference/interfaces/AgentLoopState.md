---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [packages/ai/src/types.ts:783](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L783)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/types.ts:789](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L789)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [packages/ai/src/types.ts:785](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L785)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/types.ts:787](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L787)

Current messages array
