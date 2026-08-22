---
id: encodeWsFrame
title: encodeWsFrame
---

# Function: encodeWsFrame()

```ts
function encodeWsFrame(chunk, id): string;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:35](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L35)

Encode one server→client frame. Durable frames carry the opaque offset in an
`{ id, chunk }` envelope (identical to the NDJSON wire); non-durable frames
are the bare chunk. Unambiguous because a bare chunk always has a top-level
`type` and the envelope never does.

## Parameters

### chunk

[`AGUIEvent`](../type-aliases/AGUIEvent.md)

### id

`string` \| `undefined`

## Returns

`string`
