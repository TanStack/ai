---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [packages/typescript/ai/src/types.ts:659](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L659)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/typescript/ai/src/types.ts:665](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L665)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [packages/typescript/ai/src/types.ts:661](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L661)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/typescript/ai/src/types.ts:663](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L663)

Current messages array
