---
id: resumeWebSocketStream
title: resumeWebSocketStream
---

# Function: resumeWebSocketStream()

```ts
function resumeWebSocketStream<TOffset>(socket, options): void;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:297](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L297)

Read-only replay of a run's durability log over a socket (mirrors
`resumeServerSentEventsResponse`). The adapter captures the offset from the
request (`?offset`/`Last-Event-ID`); no model runs. Closes 1008 when there
is nothing to resume.

## Type Parameters

### TOffset

`TOffset` *extends* `string` = `string`

## Parameters

### socket

[`WebSocketLike`](../interfaces/WebSocketLike.md)

### options

#### adapter

[`StreamDurability`](../interfaces/StreamDurability.md)\<`TOffset`\>

#### batch?

`number`

#### debug?

[`DebugOption`](../type-aliases/DebugOption.md)

## Returns

`void`
