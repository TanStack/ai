---
title: Tool Result Metadata
id: tool-result-metadata
order: 3
description: "Send app-only data from a server tool to your UI, such as source documents for citations. The model never sees it."
keywords:
  - tanstack ai
  - tool result metadata
  - setResultMetadata
  - resultMetadataSchema
  - citations
  - sources
  - rag
---

A search tool finds five documents. The model needs the text to write its answer. Your UI needs the ids, titles, and links to show citations. If you put the links in the tool result, the model reads them too, and you pay for those tokens.

Result metadata is a second output of a tool call. Your app sees it. The model never sees it.

## Show the sources of a search tool

### 1. Define the tool in a shared file

Add `resultMetadataSchema` to the definition. It types the metadata on the server and on the client:

```typescript
// tools/search-docs.ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

export const searchDocsDef = toolDefinition({
  name: "search_docs",
  description: "Search the help center and return the passages that match",
  inputSchema: z.object({
    query: z.string().meta({ description: "The words to search for" }),
  }),
  resultMetadataSchema: z.object({
    sources: z.array(
      z.object({ id: z.string(), title: z.string(), url: z.string() }),
    ),
  }),
});
```

### 2. Set the metadata in the server tool

Call `context?.setResultMetadata?.(...)` in the `.server()` function. The array stands in for your search index:

```typescript
// tools/search-docs.server.ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// The same definition as tools/search-docs.ts. In your app, import it from that file.
const searchDocsDef = toolDefinition({
  name: "search_docs",
  description: "Search the help center and return the passages that match",
  inputSchema: z.object({
    query: z.string().meta({ description: "The words to search for" }),
  }),
  resultMetadataSchema: z.object({
    sources: z.array(
      z.object({ id: z.string(), title: z.string(), url: z.string() }),
    ),
  }),
});

const articles = [
  {
    id: "returns",
    title: "Return policy",
    url: "https://example.com/help/returns",
    text: "You can return an item within 30 days.",
  },
  {
    id: "shipping",
    title: "Shipping times",
    url: "https://example.com/help/shipping",
    text: "We ship an order within 2 business days.",
  },
];

export const searchDocs = searchDocsDef.server(async ({ query }, context) => {
  // Drop empty words, so that extra spaces do not match every article.
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const hits = articles.filter((article) => {
    const searchable = `${article.title} ${article.text}`.toLowerCase();
    return words.some((word) => searchable.includes(word));
  });

  // The app gets this. The model does not.
  context?.setResultMetadata?.({
    sources: hits.map(({ id, title, url }) => ({ id, title, url })),
  });

  // The model gets this.
  return { passages: hits.map((hit) => hit.text) };
});
```

### 3. Pass the tool to `chat()`

```typescript
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { searchDocs } from "../tools/search-docs.server";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
    tools: [searchDocs],
  });

  return toServerSentEventsResponse(stream);
}
```

### 4. Show the sources in your chat

Pass the definition to `useChat`. A check on `part.name` gives you a typed `part.resultMetadata`:

```tsx
// app/chat.tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// The same definition as tools/search-docs.ts. In your app, import it from that file.
const searchDocsDef = toolDefinition({
  name: "search_docs",
  description: "Search the help center and return the passages that match",
  inputSchema: z.object({
    query: z.string().meta({ description: "The words to search for" }),
  }),
  resultMetadataSchema: z.object({
    sources: z.array(
      z.object({ id: z.string(), title: z.string(), url: z.string() }),
    ),
  }),
});

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
    tools: [searchDocsDef],
  });

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) => {
            if (part.type === "text") {
              return <p key={index}>{part.content}</p>;
            }
            if (part.type === "tool-call" && part.name === "search_docs") {
              // part.resultMetadata is { sources: Array<{ id, title, url }> } | undefined
              return (
                <ul key={part.id}>
                  {part.resultMetadata?.sources.map((source) => (
                    <li key={source.id}>
                      <a href={source.url}>{source.title}</a>
                    </li>
                  ))}
                </ul>
              );
            }
            return null;
          })}
        </div>
      ))}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(input);
          setInput("");
        }}
      >
        <input value={input} onChange={(event) => setInput(event.target.value)} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

### 5. Try it

Ask your chat "How long does shipping take?"

- The model answers from the passage.
- Under the answer, your chat shows a "Shipping times" link.
- The request to the model has the passage text, but no link.

In TanStack devtools, the tool result shows the value under **Result metadata**.

## Keep the sources after a reload

When the user reloads the page, the client gets the thread again from the server. The server owns the result metadata:

- The client never sends result metadata to the server. This is true with a `connection` and with a `fetcher`.
- `chatParamsFromRequest` removes app keys from the tool rows of a request, so a changed client cannot set them.

Without persistence, the server has no copy, so the sources of earlier turns are lost.

With `withPersistence`, the server stores the metadata on the tool message. A reload then fills `part.resultMetadata` again.

1. Add `withPersistence` and a `GET` route to the server:

```typescript
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import {
  memoryPersistence,
  reconstructChat,
  withPersistence,
} from "@tanstack/ai-persistence";
import { searchDocs } from "../tools/search-docs.server";

const persistence = memoryPersistence();

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
    tools: [searchDocs],
    middleware: [withPersistence(persistence)],
  });

  return toServerSentEventsResponse(stream);
}

// A single-user demo. For a multi-user app, see below.
export function GET(request: Request): Promise<Response> {
  return reconstructChat(persistence, request);
}
```

2. Add `persistence: true` to `useChat`:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { searchDocsDef } from "../tools/search-docs";

export function useSupportChat() {
  return useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
    tools: [searchDocsDef],
    persistence: true,
  });
}
```

Ask a question, then reload the page. The links are still under the answer.

The routes above are for a single-user demo. Any caller that knows a thread id can read that thread and write to it. In a multi-user app, check that the user owns the thread in both routes:

- `POST`: check the thread before `chat()` reads or writes it.
- `GET`: pass `authorize` to `reconstructChat`.

Here is `api/chat.ts` with both checks. The two routes use the same `persistence`:

```typescript
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import {
  memoryPersistence,
  reconstructChat,
  withPersistence,
} from "@tanstack/ai-persistence";
import { searchDocs } from "../tools/search-docs.server";

const persistence = memoryPersistence();

// Replace this function with your session and ownership check.
// Get the user from your server session, not from the request body.
// It returns false, so it blocks every request until you replace it.
async function ownsThread(request: Request, threadId: string) {
  void request;
  void threadId;
  return false;
}

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);
  if (!(await ownsThread(request, params.threadId))) {
    return new Response("Forbidden", { status: 403 });
  }

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
    tools: [searchDocs],
    middleware: [withPersistence(persistence)],
  });

  return toServerSentEventsResponse(stream);
}

export function GET(request: Request): Promise<Response> {
  return reconstructChat(persistence, request, {
    authorize: (threadId, req) => ownsThread(req, threadId),
  });
}
```

A denied request gets a `403` response. For a production store, see [Chat persistence](../persistence/chat-persistence).

## How `setResultMetadata` merges

You can call `setResultMetadata` more than once in one call. Each call merges its top-level keys into the value:

```typescript
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

export const defineWord = toolDefinition({
  name: "define_word",
  description: "Give the meaning of a word",
  inputSchema: z.object({ word: z.string() }),
}).server(async ({ word }, context) => {
  context?.setResultMetadata?.({ word, source: "cache", debug: { hits: 1 } });
  context?.setResultMetadata?.({ source: "dictionary-api" });
  context?.setResultMetadata?.({ debug: undefined });
  // The result metadata is now { word, source: "dictionary-api" }
  return { meaning: `The meaning of ${word}` };
});
```

- A key in a later call replaces the same key. The other keys stay.
- A nested value, such as `debug`, is replaced as a whole. It is not merged.
- A key set to `undefined` is removed.
- The `tanstack` key is reserved. A value that you set on it is dropped.

## When the metadata fails

- **The value is not JSON**: a `BigInt`, or an object that contains itself, makes the tool call fail with an error.
- **The value does not fit `resultMetadataSchema`**: `chat()` checks the merged value after the tool returns. A mismatch makes the tool call fail, and the metadata is dropped. If the tool does not set metadata, `chat()` does not check the schema, and the call does not fail.
- **The tool throws**: `chat()` checks the metadata that the tool set before the throw. Only metadata that passes the check stays on the error result.

The model gets a short error with only the tool name:

- Not JSON: `Result metadata for tool search_docs is not JSON`.
- Schema mismatch: `Result metadata validation failed for tool search_docs`.

The details go to the server log, so the model does not see your metadata values.

The check needs a Standard Schema, such as Zod. An async Standard Schema also works, because `chat()` waits for the check. A JSON Schema in `resultMetadataSchema` is not checked, and the type is `Record<string, unknown>`. A tool with no `resultMetadataSchema` has the same type.

## Client tools cannot set it

Result metadata works only in server tools.

- In a `.client()` tool, a call to `setResultMetadata` is a type error. If the code runs anyway, the call throws.
- In a WebMCP tool, the call throws.

The error is:

```text
setResultMetadata works only in server tools. A client tool can return the data in its output or keep it in app state.
```

A client tool already runs in your app. Return the data in the output, or put it in your app state.

A server tool that runs through the sandbox tool bridge (the ACP and Claude Code adapters) cannot set result metadata yet. In that tool, `context?.setResultMetadata` is `undefined`, so the call does nothing.

## Advanced

### Read the raw value

The `tool-result` part of the same call has the raw value in `part.metadata`. It has the app keys and the reserved `tanstack` key. Use `part.resultMetadata` on the `tool-call` part for your UI, because it has only the app keys and it is typed.

### Harness session view

In a [harness session view](../harness/custom-ui#2-show-the-state), a `tool-call` part has the same `resultMetadata`, also after a reload. It is not typed.

### MCP and middleware

- An MCP tool gets its result metadata from the `_meta` of the MCP result. See [Read the result `_meta`](./mcp-managed#read-the-result-_meta).
- Middleware reads the value in `onAfterToolCall` and can replace it. See [onAfterToolCall](../advanced/middleware-advanced#onaftertoolcall).
