---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [types.ts:219](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L219)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [types.ts:225](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L225)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [types.ts:221](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L221)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage[];
```

Defined in: [types.ts:223](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L223)

Current messages array
