---
id: ProcessorResult
title: ProcessorResult
---

Defined in: [packages/ai/src/activities/chat/stream/types.ts:77](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/types.ts#L77)

Result from processing a stream

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/activities/chat/stream/types.ts:78](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/types.ts#L78)

***

### finishReason?

```ts
optional finishReason?: string | null;
```

Defined in: [packages/ai/src/activities/chat/stream/types.ts:81](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/types.ts#L81)

***

### thinking?

```ts
optional thinking?: string;
```

Defined in: [packages/ai/src/activities/chat/stream/types.ts:79](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/types.ts#L79)

***

### toolCalls?

```ts
optional toolCalls?: ToolCall<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/stream/types.ts:80](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/types.ts#L80)
