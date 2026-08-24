---
title: Compaction
id: compaction
order: 3
description: "Keep long chats under the context limit with @tanstack/ai-compaction. withCompaction runs a pluggable strategy before each model call: evict, summarize, or clear old tool output."
keywords:
  - tanstack ai
  - compaction
  - context window
  - middleware
  - token limit
  - summarize history
---

A long chat or a multi-step agent loop keeps adding messages. At some point the transcript passes the model's context limit and the call fails. You want the conversation to keep working without hitting that wall.

`withCompaction` shrinks the history before each model call. When the transcript passes `maxTokens`, it runs a **strategy** that rewrites the messages. It is an ordinary [`ChatMiddleware`](./middleware), so you add it to the `middleware` array of any `chat()` call.

## Install

```bash
pnpm add @tanstack/ai-compaction
```

## Quick start

The default strategy drops the oldest messages once the transcript passes `maxTokens` and keeps the recent ones.

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { withCompaction } from "@tanstack/ai-compaction";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    messages,
    middleware: [withCompaction({ maxTokens: 100_000 })],
  });

  return toServerSentEventsResponse(stream);
}
```

## Pick a strategy

Pass `strategy` to change how the history shrinks. Three are built in.

| Strategy | What it does | Cost |
|----------|--------------|------|
| `evictOldest` (default) | Drop the oldest messages, leave a marker | No extra model call |
| `summarizeOldest` | Replace the oldest messages with an LLM summary | One summarize call |
| `clearToolResults` | Stub the content of old tool results, keep the messages | No extra model call |

### evictOldest

Cheapest. Keeps the recent tail, drops the older head, and leaves a short marker in its place. This is the default, so you only name it to tune `keepRecentTokens`.

```typescript
import { withCompaction, evictOldest } from "@tanstack/ai-compaction";

withCompaction({
  maxTokens: 100_000,
  strategy: evictOldest({ keepRecentTokens: 40_000 }),
});
```

### summarizeOldest

Keeps the gist of old turns instead of dropping them, at the cost of one summarization call. Pass a `summarize` callback. It gets the messages about to be dropped and returns the summary text. Wire it to `summarize()` or any model call.

```typescript
import { chat, summarize, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText, openaiSummarize } from "@tanstack/ai-openai";
import { withCompaction, summarizeOldest } from "@tanstack/ai-compaction";
import type { ModelMessage } from "@tanstack/ai";

async function summarizeHistory(messages: Array<ModelMessage>): Promise<string> {
  const text = messages
    .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : ""}`)
    .join("\n");

  const { summary } = await summarize({
    adapter: openaiSummarize("gpt-5.5"),
    text,
  });
  return summary;
}

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    messages,
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

### clearToolResults

Best for agent loops. Tool output (file reads, command output) is usually most of the tokens. This strategy replaces the content of old tool results with a stub and keeps every message and its tool-call pairing in place. The conversation shape does not change.

```typescript
import { withCompaction, clearToolResults } from "@tanstack/ai-compaction";

withCompaction({
  maxTokens: 100_000,
  // Keep the 5 most recent tool results in full, stub the older ones.
  strategy: clearToolResults({ keepRecentToolResults: 5 }),
});
```

### Write your own

A strategy is a function. It gets the messages and the budget, and returns the rewritten messages, or `null` to change nothing. It runs only when the estimate is over `maxTokens`.

```typescript
import { withCompaction } from "@tanstack/ai-compaction";
import type { CompactionStrategy } from "@tanstack/ai-compaction";

// Keep only the last message.
const keepLastOnly: CompactionStrategy = (messages) => {
  if (messages.length <= 1) return null;
  return messages.slice(-1);
};

withCompaction({ maxTokens: 100_000, strategy: keepLastOnly });
```

## Options

### withCompaction

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTokens` | `number` | - | **Required.** Compact when the estimated tokens across `messages` pass this. |
| `strategy` | `CompactionStrategy` | `evictOldest()` | How to shrink the messages. |
| `estimateTokens` | `(message: ModelMessage) => number` | characters / 4 | Per-message token estimate. Pass a real tokenizer if you need exact counts. |
| `onCompact` | `(info: CompactionInfo) => void` | - | Runs after each compaction. `info` is `{ before, after, messagesBefore, messagesAfter }` (token and message counts). |

### Strategy options

| Strategy | Options |
|----------|---------|
| `evictOldest` | `keepRecentTokens` (default `maxTokens / 2`), `marker` |
| `summarizeOldest` | `summarize` (**required**), `keepRecentTokens`, `summaryRole` |
| `clearToolResults` | `keepRecentToolResults` (default `3`), `stub` |

The token count is a rough `characters / 4` estimate. It is good enough to trigger on, not exact. Pass `estimateTokens` for provider-accurate counts.

## What it keeps safe

- **The system prompt is never dropped.** `chat()` keeps it separate from `messages`, so compaction only touches the conversation.
- **Tool calls stay paired with their results.** The built-in strategies never leave an orphaned tool result, so the request stays valid.
- **It runs before every model call.** Compaction is incremental: as the chat keeps growing it compacts again, and a later `summarizeOldest` pass folds an earlier summary into the new one.

## Next steps

- [Middleware](./middleware): the full hook reference and how middleware composes
- [Built-in Middleware](./built-in-middleware): ready-made middleware that ships in `@tanstack/ai`
