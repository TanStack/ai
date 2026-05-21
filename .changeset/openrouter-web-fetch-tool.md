---
'@tanstack/ai-openrouter': patch
---

`webFetchTool()` + `webSearchTool()` now produce wire shapes that survive the
OpenRouter SDK's outbound Zod serializer. Closes #603.

### What changed

- Added `webFetchTool()` to `@tanstack/ai-openrouter/tools` for OpenRouter's
  `openrouter:web_fetch` server tool (`engine`, `maxContentTokens`,
  `allowedDomains`, `blockedDomains`, `maxUses`).
- Bumped `@openrouter/sdk` from `0.12.14` to `0.12.35` so we can source the
  canonical input types (`WebFetchServerTool`, `WebFetchServerToolConfig`,
  `OpenRouterWebSearchServerTool`, `WebSearchConfig`) directly from the SDK.
- Reworked the wire format for both factories from the non-SDK
  `{type: 'web_*', web_*: {...}}` nesting to the SDK's canonical
  `{type: 'openrouter:web_*', parameters: {...}}` shape.

### Why this matters

Prior versions of `webSearchTool()` typed the nested `web_search` sub-object
in the metadata, but the SDK's outbound serializer (`ChatRequest$outboundSchema`)
only recognised `type` on the `ChatFunctionTool` union — the nested
sub-object wasn't a field on any member, so it was silently stripped before
HTTP send. Every option you set (`engine`, `maxResults`, `searchPrompt`) was
dropped on the wire; OpenRouter received `{type: 'web_search'}` and applied
defaults. The newly added `webFetchTool()` initially inherited the same bug.

After this change, the request body actually contains your `parameters`, so
options take effect on OpenRouter.

### Breaking change

`webSearchTool()`'s option surface now matches OpenRouter's
`WebSearchConfig` exactly:

- Removed: `searchPrompt` (never modelled by OpenRouter; was silently
  dropped pre-fix).
- Added: `allowedDomains`, `excludedDomains`, `maxTotalResults`,
  `searchContextSize`, `userLocation`.
- Unchanged: `engine`, `maxResults` (engine enum now widens to `auto`,
  `native`, `exa`, `firecrawl`, `parallel`).

Callers passing `searchPrompt` will get a TS error and should drop it — it
wasn't reaching OpenRouter anyway.

```ts
import { chat } from '@tanstack/ai'
import { openRouterText } from '@tanstack/ai-openrouter'
import { webFetchTool, webSearchTool } from '@tanstack/ai-openrouter/tools'

const stream = chat({
  adapter: openRouterText('openai/gpt-5'),
  messages: [{ role: 'user', content: 'Summarize https://example.com' }],
  tools: [
    webSearchTool({ engine: 'exa', maxResults: 5 }),
    webFetchTool({ engine: 'openrouter', maxContentTokens: 4000 }),
  ],
})
```

The Responses adapter (`createOpenRouterResponsesText`) rejects both factories
with a `RUN_ERROR` pointing at the chat-completions adapter, matching the
existing `webSearchTool()` rejection.
