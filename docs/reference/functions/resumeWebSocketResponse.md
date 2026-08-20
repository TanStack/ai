---
id: resumeWebSocketResponse
title: resumeWebSocketResponse
---

# Function: resumeWebSocketResponse()

```ts
function resumeWebSocketResponse<TOffset>(options): Response;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:408](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L408)

Cloudflare wrapper (Workers/Durable Objects): creates a `WebSocketPair`,
accepts the server socket, delegates to [resumeWebSocketStream](resumeWebSocketStream.md), and
returns the 101 upgrade `Response` carrying the client socket. Throws when
the runtime has no `WebSocketPair` (Node, Deno, Bun) — upgrade the socket
yourself and call [resumeWebSocketStream](resumeWebSocketStream.md) directly there.

## Type Parameters

### TOffset

`TOffset` *extends* `string` = `string`

## Parameters

### options

#### adapter

[`StreamDurability`](../interfaces/StreamDurability.md)\<`TOffset`\>

#### batch?

`number`

#### debug?

[`DebugOption`](../type-aliases/DebugOption.md)

## Returns

`Response`

## Example

```ts
resumeWebSocketResponse({ adapter: memoryStream(request) })
```
