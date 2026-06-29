---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [packages/ai/src/types.ts:801](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L801)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/types.ts:807](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L807)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [packages/ai/src/types.ts:803](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L803)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/types.ts:805](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L805)

Current messages array
