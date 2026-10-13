---
'@tanstack/ai': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-bedrock': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-openrouter': minor
'@tanstack/ai-mistral': minor
---

Prompt caching is now on by default. Each `chat()` call asks the provider to cache the stable start of the request (system prompt, tools, and earlier messages), so repeated requests cost less and answer sooner.

- New `chat()` option `promptCache`: `'none' | 'short' | 'long'`, or `{ retention, key }`. The default is `'short'`. The key is `promptCache.key`, else the `threadId` or `conversationId` that you give. A `threadId` that `chat()` makes up is never the key.
- To turn it off, pass `promptCache: 'none'`. Do this for a large prompt that you send to Claude one time only, because Claude bills the cache write.
- A middleware can change it for the next model call: `onConfig` gets `config.promptCache` and can return a new value.
- Each adapter sends its own fields:
  - Claude on Anthropic, Bedrock Converse, and OpenRouter gets cache markers. `'long'` asks for the 1-hour TTL.
  - OpenAI (Responses and Chat Completions) gets `prompt_cache_key`, and `prompt_cache_retention` or `prompt_cache_options` on `'long'`.
  - Mistral gets `prompt_cache_key`, and usage now reports cache reads.
  - OpenRouter gets `sessionId`.
- A manual `cache_control`, `cachePoint`, `prompt_cache_key`, or `sessionId` wins over the automatic value.
- New types: `PromptCacheRetention`, `PromptCacheOptions`, and `ResolvedPromptCache`. Adapters read `TextOptions.promptCache`.
