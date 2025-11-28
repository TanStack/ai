---
id: BaseStreamChunk
title: BaseStreamChunk
---

# Interface: BaseStreamChunk

Defined in: [types.ts:287](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L287)

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

Defined in: [types.ts:289](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L289)

***

### model

```ts
model: string;
```

Defined in: [types.ts:290](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L290)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:291](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L291)

***

### type

```ts
type: StreamChunkType;
```

Defined in: [types.ts:288](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L288)
