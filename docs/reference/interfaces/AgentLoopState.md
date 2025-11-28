---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [types.ts:220](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L220)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [types.ts:226](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L226)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [types.ts:222](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L222)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage[];
```

Defined in: [types.ts:224](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L224)

Current messages array
