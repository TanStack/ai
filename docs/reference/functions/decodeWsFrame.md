---
id: decodeWsFrame
title: decodeWsFrame
---

# Function: decodeWsFrame()

```ts
function decodeWsFrame(data): InboundFrame;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:46](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L46)

Decode one client→server frame. An `{ type: 'abort', runId }` object is a
control frame; anything else is treated as a `RunAgentInput` and validated
downstream by `chatParamsFromRequestBody`.

## Parameters

### data

`string`

## Returns

[`InboundFrame`](../type-aliases/InboundFrame.md)
