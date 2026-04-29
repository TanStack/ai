# @tanstack/ai-perplexity

[Perplexity](https://www.perplexity.ai) integration for [TanStack AI](https://tanstack.com/ai):

- **Search API tool** — call `POST https://api.perplexity.ai/search` from an LLM agent loop and get back ranked web results (`title`, `url`, `snippet`, `date?`) suitable for grounding/citation.
- **OpenAI-compatible chat client** — a thin factory that points the `openai` SDK at Perplexity's chat-completions endpoint so you can reuse existing OpenAI code paths.

## Install

```bash
pnpm add @tanstack/ai-perplexity
```

Set your API key (get one at <https://www.perplexity.ai/account/api/keys>):

```bash
export PERPLEXITY_API_KEY=...
# PPLX_API_KEY is also accepted
```

## Search tool

Wrap the Search API as a TanStack AI tool and pass it to a chat agent:

```ts
import { perplexitySearchTool } from '@tanstack/ai-perplexity'

const search = perplexitySearchTool({
  // optional defaults
  defaultMaxResults: 5,
})

// Use directly with chat()
chat({
  tools: [search],
  // ...
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

If you don't need the tool wrapping, call the Search API directly:

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

Perplexity's chat completions endpoint is OpenAI-compatible, so you can target it by swapping the `baseURL`:

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

Env vars: `PERPLEXITY_API_KEY` (preferred) or `PPLX_API_KEY`.

## Docs

- Search quickstart: <https://docs.perplexity.ai/docs/search/quickstart>
- Search API reference: <https://docs.perplexity.ai/api-reference/search-post>
- Domain filters: <https://docs.perplexity.ai/docs/search/filters/domain-filter>
- Date / recency filters: <https://docs.perplexity.ai/docs/search/filters/date-time-filters>
