---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [types.ts:599](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L599)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [types.ts:605](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L605)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [types.ts:601](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L601)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [types.ts:603](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L603)

Current messages array
