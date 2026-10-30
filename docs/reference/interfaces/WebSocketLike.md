---
id: WebSocketLike
title: WebSocketLike
---

Defined in: [packages/ai/src/stream-to-websocket.ts:15](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L15)

The minimal WHATWG WebSocket surface the core needs. Cloudflare
`WebSocketPair` server sockets, Deno's upgraded sockets, and `ws` (Node)
sockets already satisfy it; Bun's `ServerWebSocket` (handler-object API)
gets a ~10-line adapter at the call site.

## Properties

### addEventListener

```ts
addEventListener: {
  (type, handler): void;
  (type, handler): void;
};
```

Defined in: [packages/ai/src/stream-to-websocket.ts:24](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L24)

#### Call Signature

```ts
(type, handler): void;
```

##### Parameters

###### type

`"message"`

###### handler

(`ev`) => `void`

##### Returns

`void`

#### Call Signature

```ts
(type, handler): void;
```

##### Parameters

###### type

`"error"` \| `"close"`

###### handler

() => `void`

##### Returns

`void`

***

### bufferedAmount?

```ts
readonly optional bufferedAmount?: number;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:23](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L23)

Bytes that `send` queued and the socket did not write yet. A server can
read it to stop sending to a slow client. A socket without it gets no
backpressure.

***

### close

```ts
close: (code?, reason?) => void;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:17](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L17)

#### Parameters

##### code?

`number`

##### reason?

`string`

#### Returns

`void`

***

### send

```ts
send: (data) => void;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:16](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L16)

#### Parameters

##### data

`string`

#### Returns

`void`
