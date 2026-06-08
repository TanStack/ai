---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [packages/ai/src/types.ts:766](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L766)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/types.ts:772](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L772)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [packages/ai/src/types.ts:768](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L768)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/types.ts:770](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L770)

Current messages array
