---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [types.ts:539](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L539)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [types.ts:545](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L545)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [types.ts:541](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L541)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [types.ts:543](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L543)

Current messages array
