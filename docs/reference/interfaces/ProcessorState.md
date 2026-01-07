---
id: ProcessorState
title: ProcessorState
---

# Interface: ProcessorState

Defined in: [activities/chat/stream/types.ts:61](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L61)

Current state of the processor

## Properties

### content

```ts
content: string;
```

Defined in: [activities/chat/stream/types.ts:62](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L62)

***

### done

```ts
done: boolean;
```

Defined in: [activities/chat/stream/types.ts:67](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L67)

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [activities/chat/stream/types.ts:66](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L66)

***

### thinking

```ts
thinking: string;
```

Defined in: [activities/chat/stream/types.ts:63](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L63)

***

### toolCallOrder

```ts
toolCallOrder: string[];
```

Defined in: [activities/chat/stream/types.ts:65](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L65)

***

### toolCalls

```ts
toolCalls: Map<string, InternalToolCallState>;
```

Defined in: [activities/chat/stream/types.ts:64](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L64)
