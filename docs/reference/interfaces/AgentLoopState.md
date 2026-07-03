---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [packages/ai/src/types.ts:824](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L824)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/types.ts:830](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L830)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [packages/ai/src/types.ts:826](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L826)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/types.ts:828](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L828)

Current messages array
