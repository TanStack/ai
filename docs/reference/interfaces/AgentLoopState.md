---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [types.ts:571](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L571)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [types.ts:577](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L577)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [types.ts:573](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L573)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [types.ts:575](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L575)

Current messages array
