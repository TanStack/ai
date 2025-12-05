---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [types.ts:469](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L469)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [types.ts:475](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L475)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [types.ts:471](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L471)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [types.ts:473](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L473)

Current messages array
