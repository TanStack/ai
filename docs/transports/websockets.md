---
title: WebSockets
id: transports-websockets
order: 4
description: "Run many chat turns over one resumable WebSocket with the webSocket() adapter and toWebSocketResponse or toWebSocketStream on the server."
keywords:
  - tanstack ai
  - websocket
  - webSocket
  - toWebSocketResponse
  - toWebSocketStream
  - persistent transport
  - resumable websocket
---

You want one connection for the whole conversation, not one request per message. Use the built-in `webSocket()` adapter. It opens one socket for the conversation. If a durable run drops, it reconnects automatically.

## 1. Connect from the client

```typescript
import { useChat, webSocket } from "@tanstack/ai-react";

const connection = webSocket("/api/chat-ws");

const { messages, sendMessage } = useChat({ connection });
```

## 2. Accept the socket on the server

On Cloudflare Workers or Durable Objects, use `toWebSocketResponse`:

```typescript
import { chat, memoryStream, toWebSocketResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export default {
  fetch(request: Request): Response {
    return toWebSocketResponse(request, {
      durability: (ctx) => memoryStream(ctx.request),
      onRun: ({ messages, threadId, runId }) =>
        chat({
          adapter: openaiText("gpt-5.6"),
          messages,
          threadId,
          runId,
        }),
    });
  },
};
```

On other hosts, such as Node, accept the socket yourself. Then pass it to `toWebSocketStream`. See [Resumable Streams: WebSockets](../resumable-streams/websockets) for this setup, the wire protocol, and the reconnect details.

To use your own wire format or a server that you do not control, write a custom adapter. See [Custom Transports](./custom#persistent-transports).

Send two messages. Both replies stream over the same socket.
