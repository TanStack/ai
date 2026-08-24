---
title: Parallel Search
id: parallel-adapter
order: 11
description: "Add live web sources and citations to TanStack AI agents with Parallel Search."
keywords:
  - tanstack ai
  - parallel
  - parallel search
  - web search
  - citations
---

An AI agent needs current web sources to answer questions beyond its training data. Parallel Search gives any function-calling TanStack AI model ranked sources and relevant excerpts.

## Set up the workspace

`@tanstack/ai-parallel` is available from the TanStack AI workspace.

1. Install dependencies from the repository root:

   ```bash
   pnpm install
   ```

2. Set your Parallel API key:

   ```bash
   export PARALLEL_API_KEY=your-api-key
   ```

## Add web search to an agent

Add `parallelSearchTool()` to the `tools` array for a function-calling adapter:

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { parallelSearchTool } from '@tanstack/ai-parallel'

const stream = chat({
  adapter: openaiText('gpt-5.6'),
  tools: [
    parallelSearchTool({
      mode: 'fast',
      defaultMaxResults: 5,
    }),
  ],
  messages: [
    {
      role: 'user',
      content: 'Find recent research on reliable AI agents and cite your sources.',
    },
  ],
})
```

The tool runs on the server and returns each source URL, relevant excerpts, title, and publication date. Set `sessionId` explicitly when searches should share a Parallel session.

## Control search behavior

Configure source restrictions when you create the tool:

```ts
import { parallelSearchTool } from '@tanstack/ai-parallel'

const search = parallelSearchTool({
  mode: 'basic',
  defaultMaxResults: 3,
  sourcePolicy: {
    include_domains: ['arxiv.org'],
    after_date: '2026-08-01',
  },
})
```

The model can provide a query, an optional search objective, and an optional result limit. Application-owned source rules apply to every request.

## Use the search client directly

Call Parallel Search outside an agent loop with `ParallelSearchClient`:

```ts
import { ParallelSearchClient } from '@tanstack/ai-parallel'

const client = new ParallelSearchClient()
const response = await client.search({
  search_queries: ['reliable AI agent research'],
  objective: 'Find recent peer-reviewed research.',
  mode: 'basic',
  advanced_settings: { max_results: 3 },
})

for (const result of response.results) {
  console.log(result.url, result.excerpts)
}
```

The client calls `POST https://api.parallel.ai/v1/search` with your `PARALLEL_API_KEY`. See the [Parallel Search API reference](https://docs.parallel.ai/api-reference/search/search) for request details.
