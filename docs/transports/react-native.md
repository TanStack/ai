---
title: React Native
id: transports-react-native
order: 5
description: "Stream chat in React Native and Expo with xhrHttpStream or xhrServerSentEvents, and learn when fetchHttpStream works on mobile."
keywords:
  - tanstack ai
  - react native
  - expo
  - xhrHttpStream
  - xhrServerSentEvents
  - fetchHttpStream
  - UnsupportedResponseStreamError
  - mobile streaming
---

Use `useChat` from `@tanstack/ai-react` with `xhrHttpStream()` and an absolute URL. XHR progress events carry the stream when `fetch` streaming is missing.

## Quick setup

### 1. Return NDJSON from the server

Your backend returns the stream with `toHttpResponse()`:

```typescript
// server route: POST /chat/http
import { chat, chatParamsFromRequest, toHttpResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);
  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
  });
  return toHttpResponse(stream);
}
```

### 2. Set the backend URL

Put the backend address in a public Expo variable:

```env
EXPO_PUBLIC_TANSTACK_AI_BASE_URL=http://127.0.0.1:8787
```

Use a URL that your runtime can reach:

- **iOS simulator**: usually `localhost` or `127.0.0.1`.
- **Android emulator**: usually `10.0.2.2`, to reach the host machine.
- **A physical device**: a LAN URL or a tunnel URL.

### 3. Connect with `xhrHttpStream`

```tsx
import { Button, Text, View } from "react-native";
import { useChat, xhrHttpStream } from "@tanstack/ai-react";

const baseUrl =
  process.env.EXPO_PUBLIC_TANSTACK_AI_BASE_URL ?? "http://127.0.0.1:8787";

export function ChatScreen() {
  const { messages, sendMessage } = useChat({
    connection: xhrHttpStream(`${baseUrl}/chat/http`),
    threadId: "support-chat",
  });

  return (
    <View>
      {messages.map((message) => (
        <Text key={message.id}>
          {message.parts.map((part) =>
            part.type === "text" ? part.content : "",
          )}
        </Text>
      ))}
      <Button title="Send" onPress={() => void sendMessage("Hello")} />
    </View>
  );
}
```

Tap Send in the simulator. The reply streams into `messages` as the model writes it.

For a full mobile walkthrough with a Hono server and a text input, see [Quick Start: React Native](../getting-started/quick-start-react-native).

## How it works

1. `sendMessage` posts the messages to your backend through XHR.
2. The server writes each chunk as one line of JSON.
3. `xhrHttpStream()` reads new lines from each XHR progress event and updates `messages`.

Mobile connections drop often. If the server adds a durability adapter, both XHR transports reconnect and support `joinRun`. See [Resumable Streams](../resumable-streams/overview).

## Advanced

### Use SSE on mobile

If your server returns `text/event-stream` with `toServerSentEventsResponse()` (see [Server-Sent Events](./sse)), use `xhrServerSentEvents()`:

```typescript
import { xhrServerSentEvents } from "@tanstack/ai-react";

const baseUrl =
  process.env.EXPO_PUBLIC_TANSTACK_AI_BASE_URL ?? "http://127.0.0.1:8787";

export const connection = xhrServerSentEvents(`${baseUrl}/chat/sse`);
```

Pass this `connection` to `useChat`.

### Use `fetchHttpStream` on mobile

`fetchHttpStream()` works only if your React Native runtime has all of these:

- Streaming `fetch` responses.
- `Response.body.getReader()`.
- `TextDecoder`.

The server still returns newline-delimited JSON with `toHttpResponse()`:

```typescript
import { fetchHttpStream } from "@tanstack/ai-react";

const baseUrl =
  process.env.EXPO_PUBLIC_TANSTACK_AI_BASE_URL ?? "http://127.0.0.1:8787";

export const connection = fetchHttpStream(`${baseUrl}/chat/http`);
```

If one of these APIs is missing, `fetchHttpStream()` throws `UnsupportedResponseStreamError`. A polyfill that buffers the response does not help, because the transport needs incremental bytes. Use `xhrHttpStream()` or `xhrServerSentEvents()`.

### Request options on mobile

The XHR transports take `headers` and `body`, like the fetch transports. For cookies, they use `withCredentials`, not `credentials`. See [Request Options](./request-options).

### Keep the bundle small

Keep provider SDKs and server helpers on your backend. Import only hooks and connection adapters in the React Native bundle. Do not import these:

- OpenAI, Anthropic, or Gemini SDKs.
- React DOM UI or devtools UI.
- Packages for other frameworks.
