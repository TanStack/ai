---
id: ProcessorResult
title: ProcessorResult
---

# Interface: ProcessorResult

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:73](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L73)

Result from processing a stream

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:74](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L74)

***

### finishReason?

```ts
optional finishReason: string | null;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:77](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L77)

***

### thinking?

```ts
optional thinking: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:75](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L75)

***

### toolCalls?

```ts
optional toolCalls: ToolCall[];
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:76](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L76)
