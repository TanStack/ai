---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [types.ts:443](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L443)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [types.ts:449](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L449)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [types.ts:445](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L445)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [types.ts:447](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L447)

Current messages array
