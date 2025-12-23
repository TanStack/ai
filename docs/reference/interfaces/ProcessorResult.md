---
id: ProcessorResult
title: ProcessorResult
---

# Interface: ProcessorResult

Defined in: [activities/chat/stream/types.ts:51](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L51)

Result from processing a stream

## Properties

### content

```ts
content: string;
```

Defined in: [activities/chat/stream/types.ts:52](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L52)

***

### finishReason?

```ts
optional finishReason: string | null;
```

Defined in: [activities/chat/stream/types.ts:55](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L55)

***

### thinking?

```ts
optional thinking: string;
```

Defined in: [activities/chat/stream/types.ts:53](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L53)

***

### toolCalls?

```ts
optional toolCalls: ToolCall[];
```

Defined in: [activities/chat/stream/types.ts:54](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L54)
