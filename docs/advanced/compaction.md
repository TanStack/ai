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

`withCompaction` shrinks provider context before each model call. When the context passes `maxTokens`, a **strategy** rewrites what the model sees. The canonical transcript does not change. Add this [`ChatMiddleware`](./middleware) to the `middleware` array of any `chat()` call.

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

withCompaction({
  maxTokens: 100_000,
  strategy: keepLastOnly,
  strategyKey: "keep-last-v1",
});
```

Set `strategyKey` when you combine a custom strategy with persistence. Change
the key when the strategy can produce different output. This prevents an old
checkpoint from using stale behavior.

## Combine strategies

`composeStrategies` runs several strategies in order and **escalates**: it stops as soon as the result is back under `maxTokens`. Put the cheap, targeted strategy first and a broad fallback last. Here it clears old tool output first, and only drops old messages if that was not enough.

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

## Options

### withCompaction

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTokens` | `number` | - | **Required.** Compact when the estimated tokens across `messages` pass this. |
| `strategy` | `CompactionStrategy` | `evictOldest()` | How to shrink the messages. |
| `estimateTokens` | `(message: ModelMessage) => number` | characters / 4 | Per-message token estimate. Pass a real tokenizer if you need exact counts. |
| `strategyKey` | `string` | built-in strategy identity | Stable checkpoint identity. Set it for custom strategies, custom estimators, or a custom eviction marker. Change it when your `summarize` function can change. |
| `onCompact` | `(info: CompactionInfo) => void` | - | Runs after each compaction. `info` is `{ before, after, messagesBefore, messagesAfter }` (token and message counts). |

### Strategy options

| Strategy | Options |
|----------|---------|
| `evictOldest` | `keepRecentTokens` (default `maxTokens / 2`), `marker` |
| `summarizeOldest` | `summarize` (**required**), `keepRecentTokens`, `summaryRole` (default `assistant`) |
| `clearToolResults` | `keepRecentToolResults` (default `3`), `stub` |

The token count is a rough `characters / 4` estimate. It is good enough to trigger on, not exact. Pass `estimateTokens` for provider-accurate counts.

## What it keeps safe

- **The system prompt is never dropped.** `chat()` keeps it separate from `messages`, so compaction only touches the conversation.
- **Tool calls stay paired with their results.** The built-in strategies never leave an orphaned tool result, so the request stays valid.
- **It runs before every model call.** Compaction is incremental: as the chat keeps growing it compacts again.
- **The canonical transcript stays complete.** Compaction writes provider-only context. Persistence and other middleware still read `ctx.messages`.

## DevTools

After a compaction, the chat stream includes a `compaction:state` CUSTOM event.
TanStack AI DevTools has a Compaction tab on the hook. Each compact shows:

- when it ran
- token and message counts before and after
- the `maxTokens` budget
- dropped messages and the transcript sent to the model

The conversation timeline also keeps a `compaction` / `onCompact` step.

Open the AI plugin in the DevTools panel (the `ts-react-chat` example mounts it). Select the Compaction hook, then open the Compaction tab.

The `/compaction` route in `examples/ts-react-chat` uses a small `maxTokens` so this fires after a few turns. That page also shows a compact banner in the chat. The canonical transcript stays complete. The banner is example UI, not part of `useChat`.

## Compaction and persistence

Compaction and server-side [`withPersistence`](../persistence/chat-persistence)
use two message views:

- `messages` is the complete canonical transcript. Persistence saves this view.
- `providerMessages` is temporary model context. Compaction rewrites this view.

Middleware order does not change this split. Dropped, summarized, and stubbed
content remains in the message store.

If the persistence adapter has a `metadata` store, compaction also saves a small
checkpoint. The next request validates the canonical prefix, restores the last
compacted result, and adds only new messages. A changed prefix or strategy key
invalidates the checkpoint.

When a checkpoint is reused, a later `summarizeOldest` pass sees the previous
summary plus new messages. Then it folds the old summary into the new one.
Folding needs a metadata store and a strategy key.

The default strategy, standard `evictOldest`, `summarizeOldest`,
`clearToolResults`, and safe compositions get a strategy key automatically.
Set `strategyKey` for custom strategies, custom estimators, or custom marker
functions. Change `strategyKey` when your `summarize` function can change.
Without a metadata store or safe key, compaction stays stateless.

## Next steps

- [Middleware](./middleware): the full hook reference and how middleware composes
- [Built-in Middleware](./built-in-middleware): ready-made middleware that ships in `@tanstack/ai`
