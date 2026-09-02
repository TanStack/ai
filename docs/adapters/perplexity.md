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

It does **not** ship a TanStack text adapter. Pair the search tool with a function-calling adapter such as `openaiText` or `anthropicText`. Sonar `chat()` still goes through [`openaiCompatible`](./openai-compatible.md) — Sonar already searches the web and does not accept custom tools.

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-openai @tanstack/ai-perplexity
vue: @tanstack/ai @tanstack/ai-openai @tanstack/ai-perplexity
solid: @tanstack/ai @tanstack/ai-openai @tanstack/ai-perplexity
svelte: @tanstack/ai @tanstack/ai-openai @tanstack/ai-perplexity
preact: @tanstack/ai @tanstack/ai-openai @tanstack/ai-perplexity
angular: @tanstack/ai @tanstack/ai-openai @tanstack/ai-perplexity
vanilla: @tanstack/ai @tanstack/ai-openai @tanstack/ai-perplexity
octane: @tanstack/ai @tanstack/ai-openai @tanstack/ai-perplexity

<!-- ::end:tabs -->

Set your API key (get one at <https://console.perplexity.ai/group/keys>):

```bash
export PERPLEXITY_API_KEY=...
# PPLX_API_KEY is also accepted
```

## Search tool

Use the tool with a first-class function-calling adapter. Do not pass it to Sonar — Sonar Chat Completions does not register custom tools.

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { perplexitySearchTool } from '@tanstack/ai-perplexity'

const search = perplexitySearchTool({
  defaultMaxResults: 5,
})

const stream = chat({
  adapter: openaiText('gpt-5.2'),
  tools: [search],
  messages: [
    { role: 'user', content: 'What were the top AI papers this week?' },
  ],
})
```

Swap `openaiText` for `anthropicText` (or any other function-calling adapter) the same way.

The tool input schema accepts:

| Field                       | Type                                             | Notes                                                               |
| --------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| `query`                     | `string` (required)                              | The search query.                                                   |
| `max_results`               | `integer` (1–20)                                 | Defaults to `defaultMaxResults` when set, otherwise the API default (10). |
| `search_domain_filter`      | `string[]`                                       | Max 20. Allowlist (`"nytimes.com"`) **or** denylist (`"-pinterest.com"`) — never both. Hostnames, optional paths, or TLDs. |
| `search_recency_filter`     | `"hour" \| "day" \| "week" \| "month" \| "year"` | Recency window.                                                     |
| `search_after_date_filter`  | `string`                                         | `m/d/yyyy` — only results on/after this date.                       |
| `search_before_date_filter` | `string`                                         | `m/d/yyyy` — only results on/before this date.                      |

Output: `{ results: Array<{ title, url, snippet, date?, last_updated? }> }`. The wrapper keeps those citation fields and the optional response `id` on `client.search()`; it does not surface `server_time`.

The tool exposes a subset of Search API filters (`query` is a single string). `PerplexitySearchClient` also accepts `max_tokens_per_page` and up to 5 queries as `string[]`.

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

Sonar already grounds answers on the web. Use [`openaiCompatible`](./openai-compatible.md) from `@tanstack/ai-openai/compatible` — this package does not wrap that adapter, and you should not pass `perplexitySearchTool` here.

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

`getPerplexityIntegrationHeaders()` is optional. It adds Perplexity's `X-Pplx-Integration` attribution header (`tanstack/<package-version>`). The Search client sends it automatically; pass it into `openaiCompatible` if you want the same header on Sonar chat requests.

The OpenAI SDK then calls `POST https://api.perplexity.ai/chat/completions` (Perplexity's OpenAI-compatible alias for Sonar).

## References

- Search quickstart: <https://docs.perplexity.ai/docs/search/quickstart>
- Search API reference: <https://docs.perplexity.ai/api-reference/search-post>
- Domain filters: <https://docs.perplexity.ai/docs/search/filters/domain-filter>
- Date / recency filters: <https://docs.perplexity.ai/docs/search/filters/date-time-filters>
- [OpenAI-compatible adapter](./openai-compatible.md) — Sonar `chat()`
