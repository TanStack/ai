---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [packages/typescript/ai/src/types.ts:703](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L703)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/typescript/ai/src/types.ts:709](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L709)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [packages/typescript/ai/src/types.ts:705](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L705)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/typescript/ai/src/types.ts:707](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L707)

Current messages array
