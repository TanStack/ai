---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [types.ts:490](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L490)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [types.ts:496](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L496)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [types.ts:492](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L492)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [types.ts:494](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L494)

Current messages array
