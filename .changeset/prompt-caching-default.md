---
'@tanstack/ai': minor
'@tanstack/ai-harness': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-bedrock': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-models': minor
'@tanstack/ai-openrouter': minor
'@tanstack/ai-mistral': minor
'@tanstack/ai-claude-code': minor
---

Prompt caching is now on by default. Each `chat()` call asks the provider to cache the stable start of the request (system prompt, tools, and earlier messages), so repeated requests cost less and answer sooner.

- New `chat()` option `promptCache`: `'none' | 'short' | 'long'`, or `{ retention, key }`. The default is `'short'`. The key is `promptCache.key`, else the `threadId` or `conversationId` that you give.
- To turn it off, pass `promptCache: 'none'`. Do this for a large prompt that you send to Claude one time only, because Claude bills the cache write.
- Each adapter sends its own fields:
  - Claude (Anthropic, Bedrock, OpenRouter) gets cache markers.
  - OpenAI gets `prompt_cache_key`, and `prompt_cache_retention` or `prompt_cache_options` on `'long'`.
  - Mistral gets `prompt_cache_key`.
  - OpenRouter gets `sessionId`.
- A manual `cache_control`, `cachePoint`, `prompt_cache_key`, or `sessionId` wins over the automatic value.
- Harness sessions cache by default too. `defineHarness({ promptCache })` sets the default, and `host.open(harness, { threadId, promptCache })` overrides it for one session.
- `usage.promptTokens` is now the total input on Anthropic, Bedrock, and Claude Code: the uncached tokens plus the cache reads and writes. Before, it was the uncached tokens only. The cache parts stay in `promptTokensDetails`.
- New usage counts: cache reads on Mistral and on the OpenRouter Responses adapter. The harness `usage()` plugin also counts cache reads and writes.
- New compat field `supportsExplicitPromptCacheMode` on `openaiCompatible` and on `ModelCompat`.
