---
id: ProcessorState
title: ProcessorState
---

# Interface: ProcessorState

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:88](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L88)

Current state of the processor

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:89](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L89)

***

### done

```ts
done: boolean;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:94](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L94)

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:93](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L93)

***

### thinking

```ts
thinking: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:90](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L90)

***

### toolCallOrder

```ts
toolCallOrder: string[];
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:92](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L92)

***

### toolCalls

```ts
toolCalls: Map<string, InternalToolCallState>;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:91](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L91)
