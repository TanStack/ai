---
id: AgentLoopState
title: AgentLoopState
---

# Interface: AgentLoopState

Defined in: [packages/typescript/ai/src/types.ts:634](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L634)

State passed to agent loop strategy for determining whether to continue

## Properties

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/typescript/ai/src/types.ts:640](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L640)

Finish reason from the last response

***

### iterationCount

```ts
iterationCount: number;
```

Defined in: [packages/typescript/ai/src/types.ts:636](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L636)

Current iteration count (0-indexed)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/typescript/ai/src/types.ts:638](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L638)

Current messages array
