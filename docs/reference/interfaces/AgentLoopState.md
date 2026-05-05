---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [packages/typescript/ai/src/types.ts:631](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L631)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/typescript/ai/src/types.ts:637](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L637)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [packages/typescript/ai/src/types.ts:633](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L633)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/typescript/ai/src/types.ts:635](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L635)

Current messages array
