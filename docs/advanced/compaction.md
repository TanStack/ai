---
title: Compaction
id: compaction
order: 3
description: "Keep long chats under the context limit. withCompaction from @tanstack/ai-compaction shrinks what the model sees before each call: drop old messages, summarize them, or clear old tool output."
keywords:
  - tanstack ai
  - compaction
  - context window
  - middleware
  - token limit
  - summarize history
---

Compaction shortens a transcript before it passes the model context limit. A long chat or agent loop otherwise fails on the next call.

Add `withCompaction` to your `chat()` call. It runs before each model call.

## Quick setup

### 1. Install the package

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-compaction
vue: @tanstack/ai-compaction
solid: @tanstack/ai-compaction
svelte: @tanstack/ai-compaction
preact: @tanstack/ai-compaction
angular: @tanstack/ai-compaction
octane: @tanstack/ai-compaction
vanilla: @tanstack/ai-compaction

<!-- ::end:tabs -->

### 2. Add the middleware to your chat endpoint

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { withCompaction } from "@tanstack/ai-compaction";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
    middleware: [withCompaction({ maxTokens: 100_000 })],
  });

  return toServerSentEventsResponse(stream);
}
```

The client does not change. Your `useChat` code stays the same.

### 3. Watch it run

Use a small `maxTokens` and an `onCompact` log while you try it:

```typescript
import { withCompaction } from "@tanstack/ai-compaction";

const compaction = withCompaction({
  maxTokens: 2_000,
  onCompact: (info) => {
    console.log(`Compacted from ${info.before} to ${info.after} tokens`);
  },
});
```

Put `compaction` in the `middleware` array and chat for a few turns. The server logs a line each time the history shrinks, and the chat keeps answering.

## How it works

- `withCompaction` is a [chat middleware](./middleware). Before each model call, it estimates the token count of the messages (characters / 4).
- When the count passes `maxTokens`, a **strategy** rewrites the messages that go to the provider.
- The full transcript does not change. Persistence and the UI still see every message.
- The system prompt is never dropped. `chat()` keeps it separate from `messages`.
- Tool calls stay paired with their results, so the request stays valid.

## Pick a strategy

Pass `strategy` to change how the history shrinks. Three are built in:

| Strategy | What it does | Cost |
|----------|--------------|------|
| `evictOldest` (default) | Drop the oldest messages and leave a marker | No extra model call |
| `summarizeOldest` | Replace the oldest messages with a summary from a model | One summary call (up to two with `cut: 'turn'`) |
| `clearToolResults` | Replace the content of old tool results with a stub, keep the messages | No extra model call |

### evictOldest

This strategy is the cheapest. It keeps the recent messages, drops the older ones, and puts a short marker in their place. It is the default, so name it only to set `keepRecentTokens`:

```typescript
import { withCompaction, evictOldest } from "@tanstack/ai-compaction";

withCompaction({
  maxTokens: 100_000,
  strategy: evictOldest({ keepRecentTokens: 40_000 }),
});
```

### summarizeOldest

This strategy keeps the meaning of old turns and costs one summary call. Give it a `summarize` function. The function gets the messages to drop and an input with the `threadId` of the conversation. It returns the summary. Give the summary call a thread id of its own, so it does not share state with the conversation:

```typescript
import {
  chat,
  chatParamsFromRequest,
  summarize,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import type { ModelMessage } from "@tanstack/ai";
import { openaiSummarize, openaiText } from "@tanstack/ai-openai";
import {
  summarizeOldest,
  withCompaction,
  type SummarizeInput,
} from "@tanstack/ai-compaction";

async function summarizeHistory(
  messages: Array<ModelMessage>,
  { threadId }: SummarizeInput,
) {
  const text = messages
    .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : ""}`)
    .join("\n");

  // Return the whole result, so compaction can report its usage.
  return summarize({
    adapter: openaiSummarize("gpt-6.1-sol"),
    text,
    threadId: `${threadId}:compaction`,
  });
}

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
    middleware: [
      withCompaction({
        maxTokens: 100_000,
        strategy: summarizeOldest({ summarize: summarizeHistory }),
      }),
    ],
  });

  return toServerSentEventsResponse(stream);
}
```

`summarize` can return the summary text, or an object with `summary` and `usage`. Return the `summarize()` result as it is, so that compaction can report the cost of the summary.

For a coding agent, use the ready summarizer in [Better summaries](./compaction-advanced#better-summaries).

### clearToolResults

This strategy is the best fit for agent loops. Tool output (file reads, command output) is usually most of the tokens. The strategy replaces the content of old tool results with a stub. Every message and every tool-call pair stays in place.

```typescript
import { withCompaction, clearToolResults } from "@tanstack/ai-compaction";

withCompaction({
  maxTokens: 100_000,
  // Keep the 5 most recent tool results in full. Stub the older ones.
  strategy: clearToolResults({ keepRecentToolResults: 5 }),
});
```

## Combine strategies

`composeStrategies` runs several strategies in order. It stops as soon as the result is under `maxTokens`. Put the cheap, targeted strategy first and a broad fallback last.

This example clears old tool output first. It drops old messages only when that is not enough:

```typescript
import {
  withCompaction,
  composeStrategies,
  clearToolResults,
  evictOldest,
} from "@tanstack/ai-compaction";

withCompaction({
  maxTokens: 100_000,
  strategy: composeStrategies(clearToolResults(), evictOldest()),
});
```

## Let the provider compact

Some providers can compact the conversation on their own servers. The model then keeps more of the old turns than a marker gives. It costs one compaction call.

Pass the adapter of the `chat()` call as `native`. When the count passes `maxTokens`, the `compact` method of the adapter runs in place of `strategy`:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { withCompaction } from "@tanstack/ai-compaction";

// Create the adapter once, outside the request handler.
const adapter = openaiText("gpt-6.1-sol");

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter,
    messages,
    threadId,
    runId,
    middleware: [withCompaction({ maxTokens: 100_000, native: adapter })],
  });

  return toServerSentEventsResponse(stream);
}
```

- An adapter with no `compact` method uses `strategy`.
- When `compact` fails, `strategy` runs in its place.

The OpenAI Responses adapters have `compact`. See [Native compaction](../adapters/openai-advanced#native-compaction). For what happens on each kind of failure, see [Native compaction failures](./compaction-advanced#native-compaction-failures).

## When the chat is still too long

The token count is an estimate. So sometimes a call is still too long for the model, and the provider rejects it.

You do not have to catch that error. When a call fails with `CONTEXT_OVERFLOW_CODE`, `withCompaction` compacts and calls the model again, in the same run. Your code only sees the answer. This also works with `auto: false`.

It retries once for each model call. If the compacted call is still too long, the run ends with a `RUN_ERROR`:

- `code` is `CONTEXT_OVERFLOW_CODE` (`'context_overflow'`).
- `message` is the text from the provider.

These adapters set this code:

- OpenAI, Anthropic, Gemini, and Bedrock.
- OpenRouter, Grok, Cloudflare, and BytePlus.
- Other OpenAI-compatible adapters, when the provider sends `context_length_exceeded`.

To make sure that the retry always has something to drop, see [Give the retry something to cut](./compaction-advanced#give-the-retry-something-to-cut).

## Compaction and persistence

Compaction and server-side [`withPersistence`](../persistence/chat-persistence) use two views of the messages:

- `messages` is the full transcript. Persistence saves this view.
- `providerMessages` is the context for the model. Compaction rewrites this view.

The order of the middleware does not change this split. Dropped, summarized, and stubbed content stays in the message store.

If the persistence adapter has a `metadata` store, compaction also saves a small checkpoint. The next request then starts from the last compacted result. See [Checkpoints](./compaction-advanced#checkpoints) for the details.

## Advanced

[Compaction: Advanced](./compaction-advanced) has the deep details:

- Every option of `withCompaction` and of each strategy.
- Your own strategy, and compaction on your own schedule.
- Counts from the real usage of the provider, and summaries that run in the background.
- DevTools events, checkpoints, and session logs.
