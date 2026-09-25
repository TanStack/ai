<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-parallel

Give a TanStack AI agent current web sources and relevant excerpts through the [Parallel Search API](https://docs.parallel.ai/api-reference/search/search).

## Set up

1. Install the packages:

   ```bash
   npm install @tanstack/ai @tanstack/ai-openai @tanstack/ai-parallel
   ```

2. Set your Parallel API key:

   ```bash
   export PARALLEL_API_KEY=your-api-key
   ```

3. Add the search tool to a function-calling model:

   ```ts
   import { chat } from '@tanstack/ai'
   import { openaiText } from '@tanstack/ai-openai'
   import { parallelSearchTool } from '@tanstack/ai-parallel'

   const stream = chat({
     adapter: openaiText('gpt-6-sol'),
     tools: [
       parallelSearchTool({
         mode: 'fast',
         defaultMaxResults: 5,
       }),
     ],
     messages: [
       {
         role: 'user',
         content:
           'Find recent research on reliable AI agents and cite your sources.',
       },
     ],
   })
   ```

The tool returns source URLs, relevant excerpts, titles, and publication dates. Set `sessionId` explicitly when searches should share a Parallel session.

## Restrict sources

Set application-owned source rules when you create the tool:

```ts
const search = parallelSearchTool({
  mode: 'basic',
  sourcePolicy: {
    include_domains: ['arxiv.org'],
    after_date: '2026-08-01',
  },
})
```

## Call the Search API directly

```ts
import { ParallelSearchClient } from '@tanstack/ai-parallel'

const client = new ParallelSearchClient()
const { results } = await client.search({
  search_queries: ['reliable AI agent research'],
  objective: 'Find recent peer-reviewed research.',
  mode: 'basic',
  advanced_settings: { max_results: 3 },
})
```

The client sends requests to `POST https://api.parallel.ai/v1/search`. Pass `apiKey`, `baseURL`, or `fetch` to configure the client.
