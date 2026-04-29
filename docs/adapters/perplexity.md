---
title: Perplexity
id: perplexity-adapter
order: 10
description: "Use the Perplexity Search API and OpenAI-compatible chat completions with TanStack AI via @tanstack/ai-perplexity."
keywords:
  - tanstack ai
  - perplexity
  - search api
  - web search
  - adapter
---

`@tanstack/ai-perplexity` integrates [Perplexity](https://www.perplexity.ai) with TanStack AI:

- A **Search API tool** that grounds your agent on the live web (`POST https://api.perplexity.ai/search`).
- An **OpenAI-compatible chat client** that points the `openai` SDK at Perplexity's chat-completions endpoint, so existing OpenAI code can target Perplexity by swapping the base URL.

## Installation

```bash
npm install @tanstack/ai-perplexity
```

Set your API key (get one at <https://www.perplexity.ai/account/api/keys>):

```bash
export PERPLEXITY_API_KEY=...
# PPLX_API_KEY is also accepted
```

## Search tool

Wrap the Search API as a TanStack AI tool and pass it to a chat agent so the model can fetch up-to-date web results:

```ts
import { chat } from '@tanstack/ai'
import { perplexitySearchTool } from '@tanstack/ai-perplexity'

const search = perplexitySearchTool({
  // optional: applied when the model omits max_results
  defaultMaxResults: 5,
})

const stream = chat({
  // ... your text adapter ...
  tools: [search],
  messages: [
    { role: 'user', content: 'What were the top AI papers this week?' },
  ],
})
```

The tool input schema accepts:

| Field                       | Type                                              | Notes                                                              |
| --------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| `query`                     | `string` (required)                               | The search query.                                                  |
| `max_results`               | `integer` (1–20)                                  | Defaults to API default (10), or `defaultMaxResults` if configured.|
| `search_domain_filter`      | `string[]`                                        | Allowlist (`"nytimes.com"`) **or** denylist (`"-pinterest.com"`) — never both. |
| `search_recency_filter`     | `"hour" \| "day" \| "week" \| "month" \| "year"`  | Recency window.                                                    |
| `search_after_date_filter`  | `string`                                          | `m/d/yyyy` — only results on/after this date.                      |
| `search_before_date_filter` | `string`                                          | `m/d/yyyy` — only results on/before this date.                     |

Each result is `{ title, url, snippet, date? }`.

### Direct client

If you want to call the Search API outside an agent loop:

```ts
import { PerplexitySearchClient } from '@tanstack/ai-perplexity'

const client = new PerplexitySearchClient()
const { results } = await client.search({
  query: 'mars sample return mission',
  max_results: 5,
  search_recency_filter: 'month',
})
```

## Chat (OpenAI-compatible)

Perplexity exposes `POST /v1/chat/completions` with the standard OpenAI Chat Completions shape. `createPerplexityChatClient` returns an `openai` SDK instance pointed at `https://api.perplexity.ai`:

```ts
import { createPerplexityChatClient } from '@tanstack/ai-perplexity/chat'

const client = createPerplexityChatClient()
const completion = await client.chat.completions.create({
  model: 'sonar',
  messages: [
    { role: 'user', content: 'What is the latest on the Mars rover?' },
  ],
})
```

## Configuration

```ts
import { PerplexitySearchClient } from '@tanstack/ai-perplexity'

const client = new PerplexitySearchClient({
  apiKey: process.env.PERPLEXITY_API_KEY,   // explicit key (optional)
  baseURL: 'https://api.perplexity.ai',     // override (optional)
  fetch: globalThis.fetch,                  // custom fetch (optional)
})
```

## References

- Search quickstart: <https://docs.perplexity.ai/docs/search/quickstart>
- Search API reference: <https://docs.perplexity.ai/api-reference/search-post>
- Domain filters: <https://docs.perplexity.ai/docs/search/filters/domain-filter>
- Date / recency filters: <https://docs.perplexity.ai/docs/search/filters/date-time-filters>
