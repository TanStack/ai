---
id: ProcessorResult
title: ProcessorResult
---

# Interface: ProcessorResult

Defined in: [stream/types.ts:61](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/types.ts#L61)

Result from processing a stream

## Properties

### content

```ts
content: string;
```

Defined in: [stream/types.ts:62](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/types.ts#L62)

***

### finishReason?

```ts
optional finishReason: string | null;
```

Defined in: [stream/types.ts:65](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/types.ts#L65)

***

### thinking?

```ts
optional thinking: string;
```

Defined in: [stream/types.ts:63](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/types.ts#L63)

***

### toolCalls?

```ts
optional toolCalls: ToolCall[];
```

Defined in: [stream/types.ts:64](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/types.ts#L64)
