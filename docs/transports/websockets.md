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

`webSocket()` opens one socket for the conversation. A durable run reconnects on that socket.

## Quick setup

### 1. Accept the socket on the server

On Cloudflare Workers or Durable Objects, use `toWebSocketResponse`:

```typescript
// worker.ts
import { chat, memoryStream, toWebSocketResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export default {
  fetch(request: Request): Response {
    return toWebSocketResponse(request, {
      durability: (ctx) => memoryStream(ctx.request),
      onRun: ({ messages, threadId, runId }) =>
        chat({
          adapter: openaiText("gpt-6.1-sol"),
          messages,
          threadId,
          runId,
        }),
    });
  },
};
```

On other hosts, such as Node, accept the socket yourself. Then pass it to `toWebSocketStream`. See [Resumable Streams: WebSockets](../resumable-streams/websockets#hosting-on-node).

### 2. Connect from the client

```tsx
import { useChat, webSocket } from "@tanstack/ai-react";

const connection = webSocket("/api/chat-ws");

export function Chat() {
  const { messages, sendMessage } = useChat({ connection, threadId: "support-chat" });

  return (
    <div>
      {messages.map((message) => (
        <p key={message.id}>
          {message.parts.map((part) =>
            part.type === "text" ? part.content : "",
          )}
        </p>
      ))}
      <button onClick={() => void sendMessage("Hello")}>Send</button>
    </div>
  );
}
```

Send two messages. Both replies stream over the same socket.

## How it works

1. `webSocket()` opens the socket on the first `sendMessage`.
2. Each user message goes over the socket as one frame.
3. The server runs one `chat()` turn for each frame, through `onRun`, and streams the chunks back.
4. The socket stays open for the next message.

For the wire protocol, the `onRun` context, client options, and the reconnect details, see [Resumable Streams: WebSockets](../resumable-streams/websockets).

## Advanced

### Use your own wire format

To use your own wire format or a server that you do not control, write a custom transport. See [Custom Transports](./custom#persistent-transports).
