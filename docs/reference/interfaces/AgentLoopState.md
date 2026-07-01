---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [packages/ai/src/types.ts:802](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L802)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/types.ts:808](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L808)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [packages/ai/src/types.ts:804](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L804)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/types.ts:806](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L806)

Current messages array
