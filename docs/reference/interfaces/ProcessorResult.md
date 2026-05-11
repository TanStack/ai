---
id: ProcessorResult
title: ProcessorResult
---

# Interface: ProcessorResult

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:78](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L78)

Result from processing a stream

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:79](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L79)

***

### finishReason?

```ts
optional finishReason: string | null;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:82](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L82)

***

### thinking?

```ts
optional thinking: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:80](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L80)

***

### toolCalls?

```ts
optional toolCalls: ToolCall<unknown>[];
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:81](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L81)
