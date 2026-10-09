---
title: Request Options
id: transports-request-options
order: 7
description: "Send auth headers, dynamic URLs, extra body data, and per-message data with TanStack AI transports, and wrap fetch with fetchClient."
keywords:
  - tanstack ai
  - request options
  - headers
  - authentication
  - forwardedProps
  - body
  - chatParamsFromRequest
  - fetchClient
---

Your server needs more than the messages: an auth token, a user id, a model choice, or data for one message. Pass it through the adapter options.

The examples use `fetchServerSentEvents`. `fetchHttpStream` takes the same options. The XHR adapters take `headers` and `body` too, and use `withCredentials` for cookies.

## Add an auth header

Put static headers in `options.headers`:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { token } from "./auth";

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat", {
    headers: { Authorization: `Bearer ${token}` },
  }),
});
```

If the token changes (refresh tokens, short-lived JWTs), pass a function. The adapter calls it on every send, so the header always has the latest token:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { getToken } from "./auth";

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat", () => ({
    headers: { Authorization: `Bearer ${getToken()}` },
  })),
});
```

If `credentials` is `"same-origin"` (the default) or `"include"`, the browser sends cookies automatically.

## Change the URL per request

If the URL or the headers depend on per-request state (the current user, a new token), pass functions for both:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { currentUserId, getToken } from "./auth";

const { messages } = useChat({
  connection: fetchServerSentEvents(
    () => `/api/chat?user=${currentUserId}`,
    () => ({
      headers: { Authorization: `Bearer ${getToken()}` },
    }),
  ),
});
```

## Send extra data in the body

The adapter merges `options.body` into the AG-UI `forwardedProps` payload that goes to your server:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat", {
    body: { provider: "openai", model: "gpt-5.6" },
  }),
});
```

`body` and `forwardedProps` fill the same wire field:

- **Adapter `body`**: static defaults.
- **The `forwardedProps` option on `useChat`, or `sendMessage(content, { body })`**: values that change. These values win over the adapter `body`.

## Send data with one message

Pass extra JSON for one send in the second argument of `sendMessage`:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { sendMessage } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  forwardedProps: { provider: "openai" },
});

await sendMessage("Summarize the attached files", {
  body: { attachmentIds: ["att_1", "att_2"] },
});
```

The client does a shallow merge of this `body` into `forwardedProps`, with the chat-level `body` (`{ ...chatBody, ...sendOptions.body }`). If a key is in both, the `sendMessage` value wins. The merge applies to this request only.

Read the merged object on the server with `chatParamsFromRequest`. If the model must not see those keys, do not copy them into `messages`:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, forwardedProps } = await chatParamsFromRequest(request);
  const stream = chat({
    adapter: openaiText("gpt-5.6"),
    messages,
  });
  if (
    forwardedProps &&
    typeof forwardedProps === "object" &&
    "attachmentIds" in forwardedProps
  ) {
    const { attachmentIds } = forwardedProps
    if (Array.isArray(attachmentIds) && attachmentIds.length > 0) {
      // Look up the uploads. Do not add them to `messages`.
    }
  }
  return toServerSentEventsResponse(stream);
}
```

Two more rules:

- **`ChatClient`**: `sendMessage(content, body, sendOptions)` takes the same extra JSON as its second argument. The client does a shallow merge of it with `sendOptions.body`. If a key is in both, `sendOptions.body` wins.
- **`reload()`**: it starts a new request with the chat-level `forwardedProps` and `body` only. It does not send the per-call `body` of the previous send again.

## Wrap fetch

To keep SSE or HTTP streaming but wrap `fetch` (auth refresh, retries, logs, or an edge proxy), pass a `fetchClient`:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { refreshToken } from "./auth";

async function authedFetch(input: RequestInfo | URL, init?: RequestInit) {
  let response = await fetch(input, init);
  if (response.status === 401) {
    await refreshToken();
    response = await fetch(input, init);
  }
  return response;
}

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat", {
    fetchClient: authedFetch,
  }),
});
```

The `fetchClient` must have the standard `fetch` signature. `fetchHttpStream` accepts the same option. For a production example, see the [Cloudflare Adapter](../community-adapters/cloudflare).

Send a message. Your server gets the header, the body data, and the messages in one request.
