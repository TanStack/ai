---
title: Prompt Caching
id: prompt-caching
order: 4
description: "chat() caches the stable start of each request by default, so a repeated system prompt, tool list, and history cost less and answer sooner. Pick the retention, set the cache key, or turn it off."
keywords:
  - tanstack ai
  - prompt caching
  - promptCache
  - cache_control
  - prompt_cache_key
  - cached tokens
  - token cost
---

An agent sends the same start with every request: the system prompt, the tools, and the earlier messages. You pay for those input tokens on every call, and the model reads them again before it answers.

Prompt caching lets the provider keep that start. The next request with the same start reads it from the cache, so it costs less and the answer starts sooner. `chat()` turns it on by default.

## Cache a conversation

Pass the same `threadId` with every request of a conversation. `chat()` uses it as the cache key:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    systemPrompts: ["You are a support agent for Acme."],
    messages,
    // The cache key. useChat sends one threadId for each conversation.
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
```

From the second request on, the system prompt and the earlier turns come from the cache.

The cache key is the first of these that you set:

1. `promptCache.key`.
2. The `threadId` or `conversationId` of the call.
3. Nothing. Claude does not need a key. OpenAI routes requests by key, so a stable `threadId` gives a better hit rate.

A request reads from the cache only when it starts the same way as an earlier request. Text that changes on every call, such as the current time in the system prompt, ends the match at that point.

`summarize()` and direct adapter calls do not add cache fields.

## Pick the retention

Set `promptCache` on `chat()`:

| Value | What it does |
|---|---|
| `'short'` | The default. The provider keeps the cache for a short time, 5 minutes on Claude. |
| `'long'` | The provider keeps the cache longer, 1 hour on Claude. For other providers, see [What each provider gets](#what-each-provider-gets). |
| `'none'` | No caching. |

To set your own key too, pass an object:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Where is my order?" }],
  promptCache: { retention: "long", key: "acme-support" },
});
```

Both fields are optional. Without `retention`, the retention is `'short'`. The types are exported from `@tanstack/ai`: `PromptCacheRetention`, `PromptCacheOptions`, and `ResolvedPromptCache`.

In a harness, you set `promptCache` one time for every session. See [Build your first harness](../harness/overview#prompt-caching).

## When to turn it off or keep it longer

On OpenAI, Gemini, and Mistral, a cache write costs nothing extra and a cache read costs less. Keep the default there.

Claude bills the cache write. This applies to Claude on Anthropic, Bedrock, Vertex, and OpenRouter:

| Price, compared to normal input | `'short'` (5 minutes) | `'long'` (1 hour) |
|---|---|---|
| Cache write | about 1.25 times | about 2 times |
| Cache read | about 0.1 times | about 0.1 times |

The newest Claude models read from the cache for less. With `'short'`, the same start sent 2 times in 5 minutes already costs less than no cache. With `'long'`, it costs less from the third request.

Two cases change the choice:

- **A large prompt that you send one time.** For example, one long document per call that is never sent again. Nothing reads the cache, so the write is only extra cost. Use `'none'`.
- **Long pauses.** The short Claude cache ends 5 minutes after its last read. If people often reply after more than 5 minutes, use `'long'`.

```typescript
import { chat } from "@tanstack/ai";
import type { ModelMessage } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

// One long document per call, never sent again: skip the cache write.
export function reviewDocument(document: string) {
  return chat({
    adapter: anthropicText("claude-sonnet-5-5"),
    messages: [{ role: "user", content: `Review this contract:\n\n${document}` }],
    promptCache: "none",
  });
}

// People often reply after more than 5 minutes: keep the cache for 1 hour.
export function reply(messages: Array<ModelMessage>, threadId: string) {
  return chat({
    adapter: anthropicText("claude-sonnet-5-5"),
    messages,
    threadId,
    promptCache: "long",
  });
}
```

Claude caches a prompt start only when it is longer than a model minimum, from 512 to 4096 tokens. A shorter start is not cached and costs nothing extra.

## What each provider gets

Automatic caching adds these fields to the request.

### Claude models

| Adapter | `'short'` | `'long'` |
|---|---|---|
| `anthropicText`, Claude on Vertex | `cache_control: { type: 'ephemeral' }` on the system blocks, the last tool, and the last block of the last user message. At most 4 markers. With [mid-conversation tool changes](./mid-conversation-changes) on, the tool marker goes on the last start tool instead, and a mid-conversation `system` message at the end takes the message marker. | The same markers with `ttl: '1h'` |
| `bedrockText` (Converse), Claude models only | A `cachePoint` after the system prompt and at the end of the last user message | Both with `ttl: '1h'` |
| `openRouterText` with an `anthropic/*` model | `sessionId`, plus markers on the system prompt, the last tool, and the last message | The markers with `ttl: '1h'` |
| `openaiCompatible` with `compat.cacheControlFormat: 'anthropic'` (Claude through a gateway) | Markers on the system prompt, the last tool, and the last message | The markers with `ttl: '1h'` |

### Other providers

| Adapter | `'short'` | `'long'` |
|---|---|---|
| `openaiText` (Responses) | `prompt_cache_key`, cut to 64 characters | Also `prompt_cache_retention: '24h'`. On gpt-5.6 and later, `prompt_cache_options: { ttl: '30m' }` in its place. |
| `openaiChatCompletions`, `openaiCompatible` | `prompt_cache_key`, only to `api.openai.com` | The key and `prompt_cache_retention: '24h'`, when the provider supports it (`compat.supportsLongCacheRetention`) |
| `openRouterText`, every model | `sessionId`, set to the cache key | The same |
| `mistralText` | `prompt_cache_key` | The same |
| Gemini, Vertex Gemini | Nothing. The provider caches by itself. | The same |

On gpt-5.6 and later, `'none'` sends `prompt_cache_options: { mode: 'explicit' }`, so OpenAI caches nothing.

The Workers AI binding (`cloudflareBindingFetch`) passes the cache fields through. To turn caching off there, pass `promptCache: 'none'`.

## Set the cache yourself

Your own cache settings win over the automatic ones:

- **Anthropic**: `metadata.cache_control` on a system prompt, a message part, or a tool, or `modelOptions.cache_control`. Then `chat()` adds no markers to that request. See [Anthropic](../adapters/anthropic#prompt-caching).
- **Bedrock**: `metadata.cachePoint` on a system prompt, a message part, or a tool. Then `chat()` adds no cache points to that request. See [Amazon Bedrock](../adapters/bedrock#prompt-caching).
- **OpenAI**: `modelOptions.prompt_cache_key` and `modelOptions.prompt_cache_retention` replace the automatic values. See [OpenAI](../adapters/openai#prompt-caching).
- **OpenRouter**: `modelOptions.sessionId` replaces the automatic `sessionId`.

## When the tools change

The tools are near the start of each request. A tool that a middleware adds during a run changes that start, so the next call cannot read the cache from there on. On GPT and Claude models with a mid-conversation channel, `chat()` keeps the start the same and sends the new tool later in the conversation. A system prompt that you add at the end of the list goes the same way. See [Mid-Conversation Changes](./mid-conversation-changes).

## Track cached tokens and cost

`usage.promptTokens` is the full input on every adapter, cached tokens included. Two fields split it:

- `usage.promptTokensDetails.cachedTokens`: the tokens read from the cache.
- `usage.promptTokensDetails.cacheWriteTokens`: the tokens written to the cache. Claude reports this field.

Read them in the [`onUsage`](./middleware#onusage) middleware hook. It runs one time for each model call:

```typescript
import { chat } from "@tanstack/ai";
import type { ChatMiddleware } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const cacheLog: ChatMiddleware = {
  name: "cache-log",
  onUsage: (ctx, usage) => {
    const read = usage.promptTokensDetails?.cachedTokens ?? 0;
    const written = usage.promptTokensDetails?.cacheWriteTokens ?? 0;
    console.log(
      `Call ${ctx.iteration}: ${usage.promptTokens} input, ${read} read from cache, ${written} written`,
    );
  },
};

const stream = chat({
  adapter: anthropicText("claude-sonnet-5-5"),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
  middleware: [cacheLog],
});
```

The `RUN_FINISHED` event has the same `usage` object. See [Stream Events](../chat/stream-events).

To get the input cost, price each part with its own rate:

```typescript
import type { TokenUsage } from "@tanstack/ai";

// Prices per token, from the price list of your provider.
interface InputPrices {
  input: number;
  cacheRead: number;
  cacheWrite: number;
}

export function inputCost(usage: TokenUsage, prices: InputPrices) {
  const cached = usage.promptTokensDetails?.cachedTokens ?? 0;
  const written = usage.promptTokensDetails?.cacheWriteTokens ?? 0;
  const uncached = usage.promptTokens - cached - written;
  return (
    uncached * prices.input +
    cached * prices.cacheRead +
    written * prices.cacheWrite
  );
}
```

To see cache reads in a test with no provider, use the `cache` option of the fake model. See [Test with a Fake Model](./testing).

You now see how much of each request comes from the cache, and what its input costs.
