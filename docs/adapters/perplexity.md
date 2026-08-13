---
title: Perplexity Search
id: perplexity-adapter
order: 10
description: "Ground TanStack AI agents on the live web with the Perplexity Search API via @tanstack/ai-perplexity."
keywords:
  - tanstack ai
  - perplexity
  - search api
  - web search
  - grounding
---

`@tanstack/ai-perplexity` is a **Search API** package. It wraps `POST https://api.perplexity.ai/search` as a TanStack AI tool (and a low-level HTTP client) so an agent can fetch ranked web results for citation and grounding.

It does **not** ship a TanStack text adapter. Sonar `chat()` still goes through [`openaiCompatible`](./openai-compatible.md) — the same generic adapter used for any OpenAI Chat Completions provider.

## Installation

```bash
npm install @tanstack/ai @tanstack/ai-perplexity
```

For Sonar chat, also install `@tanstack/ai-openai`.

Set your API key (get one at <https://console.perplexity.ai/group/keys>):

```bash
export PERPLEXITY_API_KEY=...
# PPLX_API_KEY is also accepted
```

## Search tool

```ts
import { chat } from '@tanstack/ai'
import { openaiCompatible } from '@tanstack/ai-openai/compatible'
import {
  getPerplexityIntegrationHeaders,
  perplexitySearchTool,
} from '@tanstack/ai-perplexity'

const search = perplexitySearchTool({
  defaultMaxResults: 5,
})

const perplexity = openaiCompatible({
  name: 'perplexity',
  baseURL: 'https://api.perplexity.ai',
  apiKey: process.env.PERPLEXITY_API_KEY!,
  models: ['sonar', 'sonar-pro'],
  defaultHeaders: getPerplexityIntegrationHeaders(),
})

const stream = chat({
  adapter: perplexity('sonar-pro'),
  tools: [search],
  messages: [
    { role: 'user', content: 'What were the top AI papers this week?' },
  ],
})
```

`getPerplexityIntegrationHeaders()` is optional. It adds Perplexity's `X-Pplx-Integration` attribution header (`tanstack/<package-version>`). The Search client sends it automatically; pass it into `openaiCompatible` if you want the same header on Sonar chat requests.

The tool input schema accepts:

| Field                       | Type                                             | Notes                                                               |
| --------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| `query`                     | `string` (required)                              | The search query.                                                   |
| `max_results`               | `integer` (1–20)                                 | Defaults to the API default (10), or `defaultMaxResults` if set.    |
| `search_domain_filter`      | `string[]`                                       | Allowlist (`"nytimes.com"`) **or** denylist (`"-pinterest.com"`) — never both. Hostnames, optional paths, or TLDs. |
| `search_recency_filter`     | `"hour" \| "day" \| "week" \| "month" \| "year"` | Recency window.                                                     |
| `search_after_date_filter`  | `string`                                         | `m/d/yyyy` — only results on/after this date.                       |
| `search_before_date_filter` | `string`                                         | `m/d/yyyy` — only results on/before this date.                      |

Output: `{ results: Array<{ title, url, snippet, date? }> }`.

The tool exposes a subset of Search API filters. `PerplexitySearchClient` also accepts `max_tokens_per_page`.

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

## Configuration

```ts
import { PerplexitySearchClient } from '@tanstack/ai-perplexity'

const client = new PerplexitySearchClient({
  apiKey: process.env.PERPLEXITY_API_KEY, // explicit key (optional)
  baseURL: 'https://api.perplexity.ai', // override (optional)
  fetch: globalThis.fetch, // custom fetch (optional)
})
```

## Chat (Sonar)

Use [`openaiCompatible`](./openai-compatible.md) from `@tanstack/ai-openai`. This package does not wrap that adapter.

```ts
import { chat } from '@tanstack/ai'
import { openaiCompatible } from '@tanstack/ai-openai/compatible'
import { getPerplexityIntegrationHeaders } from '@tanstack/ai-perplexity'

const perplexity = openaiCompatible({
  name: 'perplexity',
  baseURL: 'https://api.perplexity.ai',
  apiKey: process.env.PERPLEXITY_API_KEY!,
  models: ['sonar', 'sonar-pro'],
  defaultHeaders: getPerplexityIntegrationHeaders(),
})

const stream = chat({
  adapter: perplexity('sonar'),
  messages: [{ role: 'user', content: 'What is the latest on the Mars rover?' }],
})
```

The OpenAI SDK then calls `POST https://api.perplexity.ai/chat/completions` (Perplexity's OpenAI-compatible alias for Sonar).

## References

- Search quickstart: <https://docs.perplexity.ai/docs/search/quickstart>
- Search API reference: <https://docs.perplexity.ai/api-reference/search-post>
- Domain filters: <https://docs.perplexity.ai/docs/search/filters/domain-filter>
- Date / recency filters: <https://docs.perplexity.ai/docs/search/filters/date-time-filters>
- [OpenAI-compatible adapter](./openai-compatible.md) — Sonar `chat()`
