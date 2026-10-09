---
title: Prompt Caching
id: prompt-caching
order: 17
description: "chat() asks the provider to cache the stable start of each request by default, so a repeated system prompt, tool list, and history cost less and answer sooner. Set the retention or the key, or turn it off."
keywords:
  - tanstack ai
  - prompt caching
  - promptCache
  - cache_control
  - prompt_cache_key
  - cached tokens
  - token cost
---

Every request of a chat sends the same start again: the system prompt, the tools, and the earlier messages. You pay for those tokens on each call, and the model reads them again before it answers.

Prompt caching lets the provider keep that start. The next request with the same start reads it from the cache. It costs less, and the answer starts sooner.

`chat()` turns it on for you. You change nothing.

## Give each conversation a key

Pass the `threadId` of the request to `chat()`. `chat()` uses it as the cache key:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, threadId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    systemPrompts: ["You are a support agent for Acme."],
    messages,
    threadId,
  });

  return toServerSentEventsResponse(stream);
}
```

Nothing changes on the client. `useChat` already sends one `threadId` for each conversation.

The key is the first of these that you set:

1. `promptCache.key`.
2. The `threadId` or the `conversationId` that you pass to `chat()`.
3. No key. Claude does not need one. OpenAI uses the key to route requests, so a stable `threadId` gives more cache hits.

A request reads the cache only up to the first token that differs. Text that changes on each call, such as the current time in the system prompt, ends the match there.

## Turn it off, or keep it longer

Set `promptCache` on `chat()`:

| Value | What you get |
|---|---|
| `'short'` | The default. The provider keeps the cache for a short time, 5 minutes on Claude. |
| `'long'` | A longer cache, 1 hour on Claude. For other providers, see [What each provider gets](#what-each-provider-gets). |
| `'none'` | No cache fields at all. |

To set your own key too, pass an object. Both fields are optional:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Where is my order?" }],
  promptCache: { retention: "long", key: "acme-support" },
});
```

The types come from `@tanstack/ai`: `PromptCacheRetention`, `PromptCacheOptions`, and `ResolvedPromptCache`.

Need a different cache for one model call only? A middleware can set it. See [Change the prompt cache of a call](./middleware#change-the-prompt-cache-of-a-call).

## Know what it costs on Claude

On OpenAI and Mistral, a cache write is free and a cache read is cheaper. Keep the default.

Claude bills the cache write. A write costs a bit more than normal input, and a read costs much less. So a start that is sent two times already costs less than no cache.

Two cases change the choice:

- **A large prompt that you send one time.** For example, a long document per call that you never send again. Nothing reads that cache, so the write is only extra cost. Use `'none'`.
- **Long pauses.** The short Claude cache ends 5 minutes after the last read. If your users often reply later than that, use `'long'`.

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

export function reviewContract(contract: string) {
  return chat({
    adapter: anthropicText("claude-opus-5-5"),
    messages: [{ role: "user", content: `Review this contract:\n\n${contract}` }],
    // Sent one time only: skip the cache write.
    promptCache: "none",
  });
}
```

Claude caches a start only when it is longer than a model minimum (512 to 4096 tokens). A shorter start costs nothing extra.

## What each provider gets

| Adapter | Default (`'short'`) | `'long'` |
|---|---|---|
| `anthropicText`, `anthropicVertexText` | `cache_control` markers on the last tool, the last block of the last user message, and the system blocks. At most 4. | The same markers with `ttl: '1h'` |
| `bedrockText` (Converse), Claude models only | A `cachePoint` after the system prompt and at the end of the last user message | Both with `ttl: '1h'` |
| `openRouterText` | `sessionId` set to the key. `anthropic/*` models also get markers on the system message, the last tool, and the last message. | The markers with `ttl: '1h'` |
| `openaiText` (Responses) | `prompt_cache_key`, cut to 64 characters | Also `prompt_cache_retention: '24h'`. On gpt-5.6 and later, `prompt_cache_options: { ttl: '30m' }` in its place. |
| `openaiChatCompletions` | `prompt_cache_key`, only to `api.openai.com` | The key and `prompt_cache_retention: '24h'` |
| `mistralText` | `prompt_cache_key` | The same |

Other adapters send no cache fields. On gpt-5.6 and later, `'none'` sends `prompt_cache_options: { mode: 'explicit' }`, so OpenAI caches nothing.

Each adapter page has the details: [Anthropic](../adapters/anthropic#prompt-caching), [Amazon Bedrock](../adapters/bedrock#prompt-caching), [OpenAI](../adapters/openai#prompt-caching), [OpenRouter](../adapters/openrouter#prompt-caching), and [Mistral](../adapters/mistral#prompt-caching).

## Set the cache yourself

Your own cache fields win. Then `chat()` adds no automatic fields of that kind to the request:

- **Anthropic**: `cache_control` in the `metadata` of a system prompt, a message part, or a tool, or `modelOptions.cache_control`.
- **Bedrock**: `metadata.cachePoint` on a system prompt, a message part, or a tool.
- **OpenAI**: `modelOptions.prompt_cache_key` or `modelOptions.prompt_cache_retention`.
- **OpenRouter**: `modelOptions.sessionId`.

## Add tools without losing the cache

The tools sit near the start of each request. Add a tool during a run, and the next call cannot read the cache from there. Some GPT and Claude models take the new tool inside the conversation instead, so the start stays the same. See [Mid-Conversation Changes](./mid-conversation-changes).

## See the cache work

`usage.promptTokens` is the full input. Two fields split it:

- `usage.promptTokensDetails.cachedTokens`: tokens read from the cache.
- `usage.promptTokensDetails.cacheWriteTokens`: tokens written to the cache. Claude reports it.

Log them in the [`onUsage`](./middleware#onusage) hook. It runs one time for each model call:

```typescript
import { chat } from "@tanstack/ai";
import type { ChatMiddleware } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const cacheLog: ChatMiddleware = {
  name: "cache-log",
  onUsage: (ctx, usage) => {
    const read = usage.promptTokensDetails?.cachedTokens ?? 0;
    console.log(`Call ${ctx.iteration}: ${read} of ${usage.promptTokens} tokens from the cache`);
  },
};

const stream = chat({
  adapter: anthropicText("claude-opus-5-5"),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
  middleware: [cacheLog],
});
```

From the second call of a conversation on, most of the input now comes from the cache.
