---
id: toWebSocketStream
title: toWebSocketStream
---

# Function: toWebSocketStream()

```ts
function toWebSocketStream<TOffset>(
   socket, 
   request, 
   init): void;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:115](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L115)

Run a full-duplex, conversation-scoped chat over an already-accepted server
socket. Each inbound RunAgentInput frame starts one chat() turn (via onRun)
whose chunks are pumped back as frames; the socket stays open across turns
(pending client-tool resubmit, next user message) until the client closes it
or the idle timeout fires. An abort control frame aborts only its turn.

## Type Parameters

### TOffset

`TOffset` *extends* `string` = `string`

## Parameters

### socket

[`WebSocketLike`](../interfaces/WebSocketLike.md)

### request

`Request`

### init

[`WebSocketStreamInit`](../interfaces/WebSocketStreamInit.md)\<`TOffset`\>

## Returns

`void`
