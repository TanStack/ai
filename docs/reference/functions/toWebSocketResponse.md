---
id: toWebSocketResponse
title: toWebSocketResponse
---

# Function: toWebSocketResponse()

```ts
function toWebSocketResponse<TOffset>(request, init): Response;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:389](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L389)

Cloudflare wrapper (Workers/Durable Objects): creates a `WebSocketPair`,
accepts the server socket, delegates to [toWebSocketStream](toWebSocketStream.md), and
returns the 101 upgrade `Response` carrying the client socket. Throws when
the runtime has no `WebSocketPair` (Node, Deno, Bun) — upgrade the socket
yourself and call [toWebSocketStream](toWebSocketStream.md) directly there.

## Type Parameters

### TOffset

`TOffset` *extends* `string` = `string`

## Parameters

### request

`Request`

### init

[`WebSocketStreamInit`](../interfaces/WebSocketStreamInit.md)\<`TOffset`\>

## Returns

`Response`
