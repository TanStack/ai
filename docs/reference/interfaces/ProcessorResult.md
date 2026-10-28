---
id: ProcessorResult
title: ProcessorResult
---

Defined in: packages/ai/src/activities/chat/stream/types.ts:77

Result from processing a stream

## Properties

### content

```ts
content: string;
```

Defined in: packages/ai/src/activities/chat/stream/types.ts:78

***

### finishReason?

```ts
optional finishReason?: string | null;
```

Defined in: packages/ai/src/activities/chat/stream/types.ts:81

***

### thinking?

```ts
optional thinking?: string;
```

Defined in: packages/ai/src/activities/chat/stream/types.ts:79

***

### toolCalls?

```ts
optional toolCalls?: ToolCall<unknown>[];
```

Defined in: packages/ai/src/activities/chat/stream/types.ts:80
