---
id: BaseStreamChunk
title: BaseStreamChunk
---

# Interface: BaseStreamChunk

Defined in: [types.ts:565](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L565)

## Extended by

- [`ContentStreamChunk`](ContentStreamChunk.md)
- [`ToolCallStreamChunk`](ToolCallStreamChunk.md)
- [`ToolResultStreamChunk`](ToolResultStreamChunk.md)
- [`DoneStreamChunk`](DoneStreamChunk.md)
- [`ErrorStreamChunk`](ErrorStreamChunk.md)
- [`ApprovalRequestedStreamChunk`](ApprovalRequestedStreamChunk.md)
- [`ToolInputAvailableStreamChunk`](ToolInputAvailableStreamChunk.md)
- [`ThinkingStreamChunk`](ThinkingStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:567](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L567)

***

### model

```ts
model: string;
```

Defined in: [types.ts:568](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L568)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:569](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L569)

***

### type

```ts
type: StreamChunkType;
```

Defined in: [types.ts:566](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L566)
