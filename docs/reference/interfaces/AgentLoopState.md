---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [types.ts:274](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L274)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [types.ts:280](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L280)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [types.ts:276](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L276)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage[];
```

Defined in: [types.ts:278](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L278)

Current messages array
