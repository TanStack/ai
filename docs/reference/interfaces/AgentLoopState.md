---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [packages/typescript/ai/src/types.ts:702](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L702)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/typescript/ai/src/types.ts:708](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L708)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [packages/typescript/ai/src/types.ts:704](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L704)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/typescript/ai/src/types.ts:706](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L706)

Current messages array
