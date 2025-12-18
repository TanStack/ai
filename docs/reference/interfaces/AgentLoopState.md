---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [types.ts:579](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L579)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [types.ts:585](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L585)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [types.ts:581](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L581)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [types.ts:583](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L583)

Current messages array
