<div align="center">
  <img src="https://raw.githubusercontent.com/TanStack/ai/main/media/header_ai.png" alt="TanStack AI" />
</div>

<br />

<div align="center">
  <a href="https://npmjs.com/package/@tanstack/ai-cohere" target="_parent">
    <img alt="NPM downloads" src="https://img.shields.io/npm/dm/@tanstack/ai-cohere.svg" />
  </a>
  <a href="https://github.com/TanStack/ai" target="_parent">
    <img alt="GitHub stars" src="https://img.shields.io/github/stars/TanStack/ai.svg?style=social&label=Star" />
  </a>
</div>

# @tanstack/ai-cohere

Cohere adapter for [TanStack AI](https://tanstack.com/ai). Reorder candidate
documents by relevance to a query with Cohere's rerank models — the precision
step for RAG and search pipelines.

This adapter is **rerank-only**. For chat, summarization, embeddings, or media,
use OpenAI, Anthropic, or Gemini.

## Install

```bash
pnpm add @tanstack/ai @tanstack/ai-cohere
```

## Usage

```typescript
import { rerank } from '@tanstack/ai'
import { cohereRerank } from '@tanstack/ai-cohere'

const { ranking, rerankedDocuments } = await rerank({
  adapter: cohereRerank('rerank-v3.5'),
  query: 'talk about rain',
  documents: ['sunny day at the beach', 'rainy afternoon in the city'],
  topN: 2,
})

console.log(rerankedDocuments[0]) // 'rainy afternoon in the city'
```

The adapter reads `COHERE_API_KEY` from the environment. To pass a key
explicitly, use `createCohereRerank('rerank-v3.5', 'co-...')`.

## <a href="https://tanstack.com/ai/latest/docs/rerank/rerank">Read the docs -></a>

- [Reranking Guide](https://tanstack.com/ai/latest/docs/rerank/rerank) — object
  documents, RAG pipelines, options, and the result shape.
- [Cohere Adapter](https://tanstack.com/ai/latest/docs/adapters/cohere) —
  models, configuration, and explicit API keys.
