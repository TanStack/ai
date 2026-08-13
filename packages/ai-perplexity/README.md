# @tanstack/ai-perplexity

[Perplexity](https://www.perplexity.ai) Search API for [TanStack AI](https://tanstack.com/ai).

Wraps `POST https://api.perplexity.ai/search` as a tool (and a low-level HTTP client) so an agent can fetch ranked web results (`title`, `url`, `snippet`, `date?`) for grounding.

This package does **not** ship a TanStack text adapter. For Sonar `chat()`, use [`openaiCompatible`](https://tanstack.com/ai/latest/docs/adapters/openai-compatible) from `@tanstack/ai-openai`.

## Install

```bash
pnpm add @tanstack/ai @tanstack/ai-perplexity
```

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

The tool input schema accepts:

| field                       | type                                                | notes                                                              |
| --------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| `query`                     | `string` (required)                                 | The search query.                                                  |
| `max_results`               | `integer` (1–20)                                    | Defaults to API default (10), or `defaultMaxResults` if configured.|
| `search_domain_filter`      | `string[]`                                          | Allowlist (`"nytimes.com"`) **or** denylist (`"-pinterest.com"`) — never both. |
| `search_recency_filter`     | `"hour" \| "day" \| "week" \| "month" \| "year"`    | Recency window.                                                    |
| `search_after_date_filter`  | `string`                                            | `m/d/yyyy` — only results on/after this date.                       |
| `search_before_date_filter` | `string`                                            | `m/d/yyyy` — only results on/before this date.                      |

Output: `{ results: Array<{ title, url, snippet, date? }> }`.

### Direct client usage

```ts
import { PerplexitySearchClient } from '@tanstack/ai-perplexity'

const client = new PerplexitySearchClient()
const { results } = await client.search({
  query: 'mars sample return mission',
  max_results: 5,
  search_recency_filter: 'month',
})
```

## Chat (Sonar)

Use `openaiCompatible` from `@tanstack/ai-openai`. Pass `getPerplexityIntegrationHeaders()` if you want the same `X-Pplx-Integration` attribution header the Search client sends automatically.

```ts
import { openaiCompatible } from '@tanstack/ai-openai/compatible'
import { getPerplexityIntegrationHeaders } from '@tanstack/ai-perplexity'

const perplexity = openaiCompatible({
  name: 'perplexity',
  baseURL: 'https://api.perplexity.ai',
  apiKey: process.env.PERPLEXITY_API_KEY!,
  models: ['sonar', 'sonar-pro'],
  defaultHeaders: getPerplexityIntegrationHeaders(),
})
```

## Docs

- Search quickstart: <https://docs.perplexity.ai/docs/search/quickstart>
- Search API reference: <https://docs.perplexity.ai/api-reference/search-post>
- Domain filters: <https://docs.perplexity.ai/docs/search/filters/domain-filter>
- Date / recency filters: <https://docs.perplexity.ai/docs/search/filters/date-time-filters>
