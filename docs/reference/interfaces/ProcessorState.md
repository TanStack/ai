---
id: ProcessorState
title: ProcessorState
---

# Interface: ProcessorState

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:83](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L83)

Current state of the processor

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:84](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L84)

***

### done

```ts
done: boolean;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:89](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L89)

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:88](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L88)

***

### thinking

```ts
thinking: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:85](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L85)

***

### toolCallOrder

```ts
toolCallOrder: string[];
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:87](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L87)

***

### toolCalls

```ts
toolCalls: Map<string, InternalToolCallState>;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:86](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L86)
