---
id: ProcessorResult
title: ProcessorResult
---

# Interface: ProcessorResult

Defined in: [activities/chat/stream/types.ts:69](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L69)

Result from processing a stream

## Properties

### content

```ts
content: string;
```

Defined in: [activities/chat/stream/types.ts:70](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L70)

***

### finishReason?

```ts
optional finishReason: string | null;
```

Defined in: [activities/chat/stream/types.ts:73](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L73)

***

### thinking?

```ts
optional thinking: string;
```

Defined in: [activities/chat/stream/types.ts:71](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L71)

***

### toolCalls?

```ts
optional toolCalls: ToolCall[];
```

Defined in: [activities/chat/stream/types.ts:72](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L72)
