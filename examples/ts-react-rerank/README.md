# Reranking (ts-react-rerank)

A small TanStack Start app that shows the `rerank()` activity reordering a fixed
set of support articles by relevance to a query.

The corpus is listed newest-first, which is a bad answer to every query in the
demo. The right-hand column shows what the rerank model does with it, with the
relevance score and the document's original position.

## Tech stack

- TanStack Start (full-stack React)
- `@tanstack/ai` — the `rerank()` activity
- `@tanstack/ai-cohere` — `cohereRerank(...)`
- `@tanstack/ai-openrouter` — `openRouterRerank(...)`

## Getting started

```bash
cd examples/ts-react-rerank
pnpm install
cp .env.example .env
# Add COHERE_API_KEY, OPENROUTER_API_KEY, or both
pnpm dev
```

Open http://localhost:3000. You only need a key for the provider you select.

- Cohere key: https://dashboard.cohere.com/api-keys
- OpenRouter key: https://openrouter.ai/keys

## What the example shows

**One activity, two providers.** `src/lib/server-functions.ts` calls the same
`rerank()` for both providers. Only the adapter changes:

```ts
// Cohere
await rerank({
  adapter: cohereRerank('rerank-v3.5'),
  query,
  documents: SUPPORT_DOCS,
  topN,
  modelOptions: { maxTokensPerDoc: 4096 },
})

// OpenRouter — also reaches NVIDIA rerank models through one key
await rerank({
  adapter: openRouterRerank('cohere/rerank-4-fast'),
  query,
  documents: SUPPORT_DOCS,
  topN,
})
```

**Object documents stay typed.** `SUPPORT_DOCS` is `Array<SupportDoc>`, not
`Array<string>`. `rerank()` serializes each object with `JSON.stringify` for the
provider, then hands the original object back:

```tsx
result.ranking[0].document.title // string — no cast, no id lookup
result.ranking[0].score //         number — relevance
result.ranking[0].index //         number — position in the input array
```

**Keys stay on the server.** Both adapters read their key from the environment
inside the server function, so nothing is exposed to the browser.

**Usage is reported.** Rerank bills in search units rather than tokens, so the
result panel reads `usage.unitsBilled`. OpenRouter also reports `usage.cost`.

## Files worth reading

| File                             | What's in it                                       |
| -------------------------------- | -------------------------------------------------- |
| `src/lib/server-functions.ts`    | The `rerank()` calls and adapter selection         |
| `src/lib/documents.ts`           | The corpus and why its order is deliberately bad   |
| `src/lib/models.ts`              | Model lists, re-exported from the adapter packages |
| `src/components/RerankPanel.tsx` | The before/after UI                                |

## Learn more

- [Reranking guide](../../docs/rerank/rerank.md)
- [Cohere adapter](../../docs/adapters/cohere.md)
- [OpenRouter adapter](../../docs/adapters/openrouter.md)
