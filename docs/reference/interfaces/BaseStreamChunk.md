---
id: BaseStreamChunk
title: BaseStreamChunk
---

# Interface: BaseStreamChunk

Defined in: [types.ts:272](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L272)

## Extended by

- [`ContentStreamChunk`](../ContentStreamChunk.md)
- [`ToolCallStreamChunk`](../ToolCallStreamChunk.md)
- [`ToolResultStreamChunk`](../ToolResultStreamChunk.md)
- [`DoneStreamChunk`](../DoneStreamChunk.md)
- [`ErrorStreamChunk`](../ErrorStreamChunk.md)
- [`ApprovalRequestedStreamChunk`](../ApprovalRequestedStreamChunk.md)
- [`ToolInputAvailableStreamChunk`](../ToolInputAvailableStreamChunk.md)
- [`ThinkingStreamChunk`](../ThinkingStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:274](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L274)

***

### model

```ts
model: string;
```

Defined in: [types.ts:275](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L275)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:276](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L276)

***

### type

```ts
type: StreamChunkType;
```

Defined in: [types.ts:273](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L273)
