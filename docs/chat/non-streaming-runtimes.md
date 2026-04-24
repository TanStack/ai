---
title: React Native & Expo
id: non-streaming-runtimes
order: 4
description: "Run TanStack AI on React Native, Expo, and other runtimes that can't emit ReadableStream responses — using toJSONResponse on the server and fetchJSON on the client."
keywords:
  - tanstack ai
  - react native
  - expo
  - expo router
  - metro bundler
  - non-streaming
  - toJSONResponse
  - fetchJSON
  - edge runtime
---

You have a React Native or Expo app and you want to add AI chat, but the usual `toServerSentEventsResponse()` helper crashes on Expo's server runtime with:

```
TypeError: Cannot read properties of undefined (reading 'statusText')
```

…and Metro refuses to resolve `@tanstack/ai/adapters` at all. By the end of this guide, you'll have a working chat flow on Expo/React Native using a JSON-array fallback path. The same approach works for any deployment target that can't stream `ReadableStream` responses (some edge proxies, legacy serverless runtimes, etc.).

## What's actually going wrong

Two separate problems show up on React Native / Expo:

1. **Module resolution.** `@tanstack/ai` and `@tanstack/ai-client` ship dual ESM + CJS builds with `main`/`module`/`exports` all wired up. If your version is new enough, Metro resolves them out of the box. If you're stuck on an older version, upgrade — older releases were ESM-only and Metro can't consume them.

2. **Response shape.** Expo's `@expo/server` runtime (and a few edge proxies) can't emit a `ReadableStream` body, which is what `toServerSentEventsResponse` and `toHttpResponse` return. The request silently fails on the client side and `isLoading` flips back to `false` immediately.

The fix for (2) is to drain the chat stream on the server, send the collected chunks as a single JSON array, and replay them on the client. You lose incremental rendering — the UI sees every chunk at once when the request resolves — but every other piece of the chat pipeline keeps working as-is.

## Step 1: Return a JSON-array response on the server

Swap `toServerSentEventsResponse` for `toJSONResponse` in your API route. On Expo Router:

```typescript
// app/api/chat+api.ts
import { chat, toJSONResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText("gpt-5.2"),
    messages,
  });

  return toJSONResponse(stream);
}
```

`toJSONResponse` iterates the whole stream, collects each `StreamChunk` into an array, and returns a plain `Response` with `Content-Type: application/json`. It accepts the same `init` options as `toServerSentEventsResponse` (including `abortController`) and honours any `Content-Type` you pass in `headers`.

## Step 2: Use `fetchJSON` as the connection adapter on the client

Swap `fetchServerSentEvents` for `fetchJSON` in your `useChat` call:

```typescript
import { useChat } from "@tanstack/ai-react";
import { fetchJSON } from "@tanstack/ai-client";

export function ChatScreen() {
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchJSON("/api/chat"),
  });

  // messages and isLoading behave identically to the streaming path —
  // they just update all at once when the request resolves.
  return <ChatUI messages={messages} onSend={sendMessage} busy={isLoading} />;
}
```

`fetchJSON` accepts the same `url` + `options` signature as the other connection adapters (static string or function, headers, credentials, custom `fetchClient`, extra body, abort signal). It POSTs the usual `{ messages, data }` body, decodes the response as a `StreamChunk[]`, and replays each chunk into the normal `ChatClient` pipeline — tool calls, approvals, thinking content, errors all behave the same way they do with SSE.

## Step 3: Expect no incremental rendering

The one thing you give up: the UI won't update character-by-character. The request hangs until the server finishes the whole run, then the full message — including tool calls, results, and the final assistant turn — appears at once.

If this becomes a problem, the answer is to move to a runtime that supports streaming responses (Hono on Node, Next.js, TanStack Start, a real SSE endpoint proxied through a CDN that doesn't buffer) rather than to work around the limitation further. The JSON-array path is a pragmatic escape hatch, not the intended happy path.

## Going back to streaming when you can

If you later deploy your server code to a runtime that *does* support streaming, you only need to change two call sites — `toJSONResponse` → `toServerSentEventsResponse` and `fetchJSON` → `fetchServerSentEvents`. Everything downstream (messages, tool calls, approvals, `useChat` state, error handling) is identical between the two paths, so there's no cleanup to chase through the app.

## Next Steps

- [Streaming](./streaming) — the normal incremental-rendering path
- [Connection Adapters](./connection-adapters) — full list of client-side adapters, including `fetchJSON`
- [API Reference: `toJSONResponse`](../api/ai#tojsonresponsestream-init) — server-side helper reference
- [API Reference: `fetchJSON`](../api/ai-client#fetchjsonurl-options) — client-side adapter reference
