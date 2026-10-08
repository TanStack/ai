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

Your native app calls your own backend, not a same-origin browser route. Use `useChat` from `@tanstack/ai-react` with an XHR adapter and an absolute URL.

## 1. Set the backend URL

```typescript
const baseUrl =
  process.env.EXPO_PUBLIC_TANSTACK_AI_BASE_URL ??
  'http://127.0.0.1:8787'
const httpUrl = `${baseUrl}/chat/http`
const sseUrl = `${baseUrl}/chat/sse`
```

Use a URL that your runtime can reach:

- **iOS simulator**: usually `localhost` or `127.0.0.1`.
- **Android emulator**: usually `10.0.2.2`, to reach the host machine.
- **A physical device**: a LAN URL or a tunnel URL.

## 2. Connect with `xhrHttpStream`

Use `xhrHttpStream()` for Expo and React Native. It reads newline-delimited JSON from incremental XHR progress events. Your server returns the stream with `toHttpResponse()` (see [HTTP Stream](./http-stream)):

```typescript
import { useChat, xhrHttpStream } from "@tanstack/ai-react";

const baseUrl = process.env.EXPO_PUBLIC_TANSTACK_AI_BASE_URL ?? 'http://127.0.0.1:8787';
const httpUrl = `${baseUrl}/chat/http`;

const chat = useChat({
  connection: xhrHttpStream(httpUrl),
});
```

Mobile connections drop often. If the server adds a durability adapter, both XHR adapters reconnect and support `joinRun`. See [Resumable Streams](../resumable-streams/overview).

## Use SSE on mobile

If your server returns `text/event-stream` with `toServerSentEventsResponse()` (see [Server-Sent Events](./sse)), use `xhrServerSentEvents()`:

```typescript
import { useChat, xhrServerSentEvents } from "@tanstack/ai-react";

const baseUrl = process.env.EXPO_PUBLIC_TANSTACK_AI_BASE_URL ?? 'http://127.0.0.1:8787';
const sseUrl = `${baseUrl}/chat/sse`;

const chat = useChat({
  connection: xhrServerSentEvents(sseUrl),
});
```

## Use `fetchHttpStream` on mobile

`fetchHttpStream()` works only if your React Native runtime has all of these:

- Streaming `fetch` responses.
- `Response.body.getReader()`.
- `TextDecoder`.

The server still returns newline-delimited JSON with `toHttpResponse()`:

```typescript
import { useChat, fetchHttpStream } from "@tanstack/ai-react";

const baseUrl = process.env.EXPO_PUBLIC_TANSTACK_AI_BASE_URL ?? 'http://127.0.0.1:8787';
const httpUrl = `${baseUrl}/chat/http`;

const chat = useChat({
  connection: fetchHttpStream(httpUrl),
});
```

If one of these APIs is missing, `fetchHttpStream()` throws `UnsupportedResponseStreamError`. A polyfill that buffers the response does not help, because the adapter needs incremental bytes. Use `xhrHttpStream()` or `xhrServerSentEvents()`.

## Keep the bundle small

Keep provider SDKs and server helpers on your backend. Import only hooks and connection adapters in the React Native bundle. Do not import these:

- OpenAI, Anthropic, or Gemini SDKs.
- React DOM UI or devtools UI.
- Packages for other frameworks.

For a full mobile walkthrough, see [Quick Start: React Native](../getting-started/quick-start-react-native).

Send a message from the simulator. The reply streams into `chat.messages` as the model writes it.
