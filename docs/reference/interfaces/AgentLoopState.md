---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [types.ts:205](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L205)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [types.ts:211](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L211)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [types.ts:207](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L207)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage[];
```

Defined in: [types.ts:209](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L209)

Current messages array
