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

Your server needs more than the messages. It needs an auth token, a user id, a model choice, or data for one message. Pass it through the options of the transport.

The examples use `fetchServerSentEvents`. `fetchHttpStream` and `fetchJson` take the same options. The XHR transports take `headers` and `body` too, and use `withCredentials` for cookies.

## Quick setup

### 1. Send a header and extra data from the client

Put headers in `headers`. Put extra JSON in `body`:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { getToken } from "./auth";

export function Chat() {
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat", () => ({
      headers: { Authorization: `Bearer ${getToken()}` },
      body: { provider: "openai", model: "gpt-6.1-sol" },
    })),
  });

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

The options are a function, so the transport calls it on every send. The header always has the latest token.

### 2. Read them on the server

Read the header from the request. Read the `body` data from `forwardedProps`:

```typescript
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages, threadId, runId, forwardedProps } =
    await chatParamsFromRequest(request);
  console.log("Client asked for", forwardedProps.model);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
  });
  return toServerSentEventsResponse(stream);
}
```

Click Send. Your server gets the header, the body data, and the messages in one request.

## How it works

- **`headers`** go on the POST request.
- **`body`** goes into the AG-UI `forwardedProps` field of the request body. The model does not see it.
- **Cookies** go with the request when `credentials` is `"same-origin"` (the default) or `"include"`.

## Advanced

### Static headers

If the token never changes, pass a plain object:

```typescript
import { fetchServerSentEvents } from "@tanstack/ai-react";
import { token } from "./auth";

export const connection = fetchServerSentEvents("/api/chat", {
  headers: { Authorization: `Bearer ${token}` },
});
```

Pass this `connection` to `useChat`.

### Change the URL per request

If the URL depends on per-request state (for example, the current user), pass a function for the URL too:

```typescript
import { fetchServerSentEvents } from "@tanstack/ai-react";
import { currentUserId, getToken } from "./auth";

export const connection = fetchServerSentEvents(
  () => `/api/chat?user=${currentUserId}`,
  () => ({
    headers: { Authorization: `Bearer ${getToken()}` },
  }),
);
```

### Send data with one message

Pass extra JSON for one send in the second argument of `sendMessage`:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function SummarizeButton() {
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    forwardedProps: { provider: "openai" },
  });

  return (
    <button
      onClick={() =>
        void sendMessage("Summarize the attached files", {
          body: { attachmentIds: ["att_1", "att_2"] },
        })
      }
    >
      Summarize
    </button>
  );
}
```

The client does a shallow merge of this `body` into the `forwardedProps` option. If a key is in both, the `sendMessage` value wins. The merge applies to this request only.

Read the merged object on the server. If the model must not see those keys, do not copy them into `messages`:

```typescript
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, forwardedProps } = await chatParamsFromRequest(request);
  const { attachmentIds } = forwardedProps;
  if (Array.isArray(attachmentIds) && attachmentIds.length > 0) {
    // Look up the uploads. Do not add them to `messages`.
  }
  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
  });
  return toServerSentEventsResponse(stream);
}
```

### Merge order

`body` on the transport and `forwardedProps` fill the same wire field. Later sources win on the same key:

1. The `body` option of the transport: static defaults.
2. The `forwardedProps` option of `useChat`.
3. The `body` of one `sendMessage` call.

Two more rules:

- **`ChatClient`**: `sendMessage(content, body, sendOptions)` takes the extra JSON as its second argument. The client does a shallow merge of it with `sendOptions.body`. If a key is in both, `sendOptions.body` wins.
- **`reload()`**: it starts a new request with the transport `body` and the `forwardedProps` option. It does not send the per-call `body` of the previous send again.

### Wrap fetch

To keep SSE or HTTP streaming but wrap `fetch` (auth refresh, retries, logs, or an edge proxy), pass a `fetchClient`:

```typescript
import { fetchServerSentEvents } from "@tanstack/ai-react";
import { refreshToken } from "./auth";

async function authedFetch(input: RequestInfo | URL, init?: RequestInit) {
  let response = await fetch(input, init);
  if (response.status === 401) {
    await refreshToken();
    response = await fetch(input, init);
  }
  return response;
}

export const connection = fetchServerSentEvents("/api/chat", {
  fetchClient: authedFetch,
});
```

The `fetchClient` must have the standard `fetch` signature. `fetchHttpStream` accepts the same option. For a production example, see the [Cloudflare Adapter](../community-adapters/cloudflare).
