---
'@tanstack/ai-openrouter': minor
---

feat: add `openRouterRerank` / `createOpenRouterRerank` rerank adapters

Rerank documents by relevance to a query through OpenRouter's unified
`/v1/rerank` endpoint (e.g. `cohere/rerank-v3.5`) with the `rerank()` activity.
Reads `OPENROUTER_API_KEY` from the environment and forwards the optional
`httpReferer` / `appTitle` attribution headers, consistent with the other
OpenRouter adapters.
