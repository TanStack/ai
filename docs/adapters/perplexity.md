---
title: Perplexity Search
id: perplexity-adapter
order: 10
description: "Give a TanStack AI agent live web results with the Perplexity Search API and @tanstack/ai-perplexity, or chat with Sonar."
keywords:
  - tanstack ai
  - perplexity
  - search api
  - web search
  - grounding
---

`@tanstack/ai-perplexity` exposes the Perplexity Search API as a tool. Pair it with a chat adapter that calls tools, such as `openaiText` or `anthropicText`.

Want Sonar, the Perplexity chat model, instead? See [Chat with Sonar](#chat-with-sonar).

## 1. Install

This page uses OpenAI for the chat.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai @tanstack/ai-perplexity
vue: @tanstack/ai @tanstack/ai-vue @tanstack/ai-openai @tanstack/ai-perplexity
solid: @tanstack/ai @tanstack/ai-solid @tanstack/ai-openai @tanstack/ai-perplexity
svelte: @tanstack/ai @tanstack/ai-svelte @tanstack/ai-openai @tanstack/ai-perplexity
preact: @tanstack/ai @tanstack/ai-preact @tanstack/ai-openai @tanstack/ai-perplexity
angular: @tanstack/ai @tanstack/ai-angular @tanstack/ai-openai @tanstack/ai-perplexity
vanilla: @tanstack/ai @tanstack/ai-client @tanstack/ai-openai @tanstack/ai-perplexity
octane: @tanstack/ai @tanstack/ai-octane @tanstack/ai-openai @tanstack/ai-perplexity octane

<!-- ::end:tabs -->

## 2. Set the API key

Get a key in the [Perplexity console](https://console.perplexity.ai/group/keys). Put it in the environment of your server, next to the key of your chat provider:

```bash
PERPLEXITY_API_KEY=pplx-...
OPENAI_API_KEY=sk-...
```

The tool reads `PERPLEXITY_API_KEY` first, then `PPLX_API_KEY`.

## 3. Stream a chat with web search from the server

Add the search tool to `tools`. The model calls it when it needs fresh facts:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { perplexitySearchTool } from "@tanstack/ai-perplexity";

const search = perplexitySearchTool({ defaultMaxResults: 5 });

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    tools: [search],
    messages,
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
```

To use Claude, swap `openaiText` for `anthropicText`. Any adapter that calls tools works the same way.

## 4. Render the chat

The client is the same for every provider. Point `useChat` at your route:

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        sendMessage(input);
        setInput("");
      }}
    >
      {messages.map((message) => (
        <p key={message.id}>
          {message.parts
            .map((part) => (part.type === "text" ? part.content : ""))
            .join("")}
        </p>
      ))}
      <input value={input} onChange={(event) => setInput(event.target.value)} />
    </form>
  );
}
```

For Vue, Solid, Svelte, Angular, and the other frameworks, see [Quick Start](../getting-started/quick-start#3-render-the-chat).

Ask "What were the top AI papers this week?" and the answer now uses live web results. For more on tools, see [Tools](../tools/tools).

## Search without an agent

To call the Search API in your own code, use `PerplexitySearchClient`:

```ts
import { PerplexitySearchClient } from "@tanstack/ai-perplexity";

const client = new PerplexitySearchClient();
const { results } = await client.search({
  query: "mars sample return mission",
  max_results: 5,
  search_recency_filter: "month",
});
```

The client also takes these, which the tool does not:

- `max_tokens_per_page`: the most content tokens for each page.
- `query` as an array of up to 5 queries.

## Chat with Sonar

Sonar is the Perplexity chat model. It searches the web by itself and does not take custom tools, so do not give it `perplexitySearchTool`. This package has no Sonar adapter. Use [`openaiCompatible`](./openai-compatible.md):

```ts
import { chat } from "@tanstack/ai";
import { openaiCompatible } from "@tanstack/ai-openai/compatible";
import { getPerplexityIntegrationHeaders } from "@tanstack/ai-perplexity";

const perplexity = openaiCompatible({
  name: "perplexity",
  baseURL: "https://api.perplexity.ai",
  apiKey: process.env.PERPLEXITY_API_KEY!,
  models: ["sonar", "sonar-pro"],
  defaultHeaders: getPerplexityIntegrationHeaders(),
});

const stream = chat({
  adapter: perplexity("sonar"),
  messages: [{ role: "user", content: "What is the latest on the Mars rover?" }],
  threadId: "thread-1",
});
```

The OpenAI SDK then calls `POST https://api.perplexity.ai/chat/completions`, the OpenAI-compatible path of Sonar.

`getPerplexityIntegrationHeaders()` is optional. It adds the Perplexity attribution header `X-Pplx-Integration` (`tanstack/<package-version>`). The Search client sends this header by itself.

## Models and options

### Tool options

`perplexitySearchTool(config?)` takes:

- `defaultMaxResults`: the result count when the model does not send one. An integer from 1 to 20.
- `name`: the tool name. The default is `perplexity_search`.
- `description`: the tool description that the model sees.
- `apiKey`, `baseURL`, `fetch`: the same as on `PerplexitySearchClient`. See [Configuration](#configuration).

### Tool input

The model fills these fields when it calls the tool:

| Field | Type | Notes |
| --- | --- | --- |
| `query` | `string` (required) | The search query. |
| `max_results` | `integer` (1 to 20) | The default is `defaultMaxResults` when set, else the API default (10). |
| `search_domain_filter` | `string[]` | Max 20. An allowlist (`"nytimes.com"`) or a denylist (`"-pinterest.com"`), never both. Hostnames, optional paths, or TLDs. |
| `search_recency_filter` | `"hour" \| "day" \| "week" \| "month" \| "year"` | The recency window. |
| `search_after_date_filter` | `string` | `m/d/yyyy`. Only results on or after this date. |
| `search_before_date_filter` | `string` | `m/d/yyyy`. Only results on or before this date. |

### Tool output

The tool returns `{ results: Array<{ title, url, snippet, date?, last_updated? }> }`.

- `client.search()` also returns the optional response `id`.
- Neither returns `server_time`.

## Advanced

### Configuration

```ts
import { PerplexitySearchClient } from "@tanstack/ai-perplexity";

const client = new PerplexitySearchClient({
  apiKey: process.env.PERPLEXITY_API_KEY, // optional, explicit key
  baseURL: "https://api.perplexity.ai", // optional, override
  fetch: globalThis.fetch, // optional, custom fetch
});
```

The client calls `POST {baseURL}/search` with a bearer token.

### Bring your own key

`perplexityByok` from `@tanstack/ai-perplexity/byok` declares Perplexity for the BYOK store, with `PERPLEXITY_API_KEY` and `PPLX_API_KEY` as its env vars. See [Bring Your Own Key](../advanced/byok).

### Perplexity references

- [Search quickstart](https://docs.perplexity.ai/docs/search/quickstart)
- [Search API reference](https://docs.perplexity.ai/api-reference/search-post)
- [Domain filters](https://docs.perplexity.ai/docs/search/filters/domain-filter)
- [Date and recency filters](https://docs.perplexity.ai/docs/search/filters/date-time-filters)
