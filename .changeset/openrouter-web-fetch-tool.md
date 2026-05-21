---
'@tanstack/ai-openrouter': patch
---

Add `webFetchTool()` to `@tanstack/ai-openrouter/tools` for OpenRouter's
`openrouter:web_fetch` server tool, mirroring the existing `webSearchTool()`
factory. Lets any OpenRouter-proxied chat model fetch full page content from
URLs (with `engine`, `maxContentTokens`, `allowedDomains`, `blockedDomains`
options) without hand-constructing the tool spec. Closes #603.

```ts
import { chat } from '@tanstack/ai'
import { openRouterText } from '@tanstack/ai-openrouter'
import { webFetchTool } from '@tanstack/ai-openrouter/tools'

const stream = chat({
  adapter: openRouterText('openai/gpt-5'),
  messages: [{ role: 'user', content: 'Summarize https://example.com' }],
  tools: [webFetchTool({ engine: 'openrouter', maxContentTokens: 4000 })],
})
```

The Responses adapter (`createOpenRouterResponsesText`) rejects
`webFetchTool()` with a `RUN_ERROR` pointing users at the chat-completions
adapter, matching how it already handles `webSearchTool()`.
