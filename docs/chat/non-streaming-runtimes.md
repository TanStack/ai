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

> **Want to see it working before you swap your own app?** The [ts-react-chat example](https://github.com/TanStack/ai/tree/main/examples/ts-react-chat) ships a `/tanchat-json` route that uses this exact pair (`toJSONResponse` on the server, `fetchJSON` on the client). Run `pnpm dev` from `examples/ts-react-chat` and open `/tanchat-json` to compare it against the streaming `/` route side-by-side.

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

## Troubleshooting

`fetchJSON` surfaces upstream failures with enough context to skip a debugger trip — match the error string against the cases below.

**`fetchJSON: failed to parse response body as JSON from /api/chat (status 502): …`**

The server returned a non-JSON body — usually an HTML gateway error page from a proxy in front of your handler (Cloudflare, a Vercel edge buffer, an API gateway that intercepted before your route ran). The cause is upstream of TanStack AI; check the proxy logs or hit the URL directly with `curl` to see what's actually being returned.

**`HTTP error! status: 429 Too Many Requests — {"error":{"type":"rate_limit_error",…}}`**

The body snippet (truncated to 500 chars) is the raw response from your server route. For provider-relayed errors like this rate-limit JSON, the snippet preserves the upstream `type` / `message` fields — surface them in your UI rather than showing a generic "request failed".

**`fetchJSON: expected response body to be a JSON array of StreamChunks. Did you forget to use \`toJSONResponse(stream)\` on the server?`**

The route returned valid JSON, but not an array. Almost always a server-side mistake: returning `Response.json({ messages: [...] })` or similar instead of `toJSONResponse(stream)`. Check the API route matches the [Step 1 example](#step-1-return-a-json-array-response-on-the-server).

**The request hangs forever and `isLoading` stays `true`.**

The server is buffering the response and never flushing. If the runtime supports streaming at all, switch to `toServerSentEventsResponse` — it'll fail loudly instead of silently buffering. If buffering is unavoidable (Expo, sandboxed previews), confirm the server route is actually reaching `toJSONResponse` and not crashing earlier; check server logs.

If you abort the request from the client (e.g. the user navigates away), `fetchJSON` honours the abort signal and stops yielding chunks even after the response has been received. No extra cleanup is needed in `useChat` consumers.

## Going back to streaming when you can

If you later deploy your server code to a runtime that *does* support streaming, you only need to change two call sites — `toJSONResponse` → `toServerSentEventsResponse` and `fetchJSON` → `fetchServerSentEvents`. Everything downstream (messages, tool calls, approvals, `useChat` state, error handling) is identical between the two paths, so there's no cleanup to chase through the app.

## Next Steps

- [Streaming](./streaming) — the normal incremental-rendering path
- [Connection Adapters](./connection-adapters) — full list of client-side adapters, including `fetchJSON`
- [API Reference: `toJSONResponse`](../api/ai#tojsonresponsestream-init) — server-side helper reference
- [API Reference: `fetchJSON`](../api/ai-client#fetchjsonurl-options) — client-side adapter reference
