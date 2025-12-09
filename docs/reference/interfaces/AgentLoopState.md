---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [types.ts:450](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L450)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [types.ts:456](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L456)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [types.ts:452](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L452)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [types.ts:454](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L454)

Current messages array
