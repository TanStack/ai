---
id: ProcessorState
title: ProcessorState
---

# Interface: ProcessorState

Defined in: [stream/types.ts:71](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/types.ts#L71)

Current state of the processor

## Properties

### content

```ts
content: string;
```

Defined in: [stream/types.ts:72](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/types.ts#L72)

***

### done

```ts
done: boolean;
```

Defined in: [stream/types.ts:77](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/types.ts#L77)

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [stream/types.ts:76](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/types.ts#L76)

***

### thinking

```ts
thinking: string;
```

Defined in: [stream/types.ts:73](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/types.ts#L73)

***

### toolCallOrder

```ts
toolCallOrder: string[];
```

Defined in: [stream/types.ts:75](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/types.ts#L75)

***

### toolCalls

```ts
toolCalls: Map<string, InternalToolCallState>;
```

Defined in: [stream/types.ts:74](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/types.ts#L74)
