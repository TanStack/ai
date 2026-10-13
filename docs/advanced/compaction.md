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

## Let the provider compact

Some providers can compact the conversation on their own servers. The model then keeps more of the old turns than a marker gives. It costs one compaction call.

Pass the adapter of the `chat()` call as `native`. When the count passes `maxTokens`, the adapter's `compact` method runs in place of `strategy`.

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { withCompaction } from "@tanstack/ai-compaction";

const adapter = openaiText("gpt-6.1-sol");

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter,
    messages,
    middleware: [withCompaction({ maxTokens: 100_000, native: adapter })],
  });

  return toServerSentEventsResponse(stream);
}
```

- An adapter with no `compact` method uses `strategy`.
- When `compact` fails, `strategy` runs in its place. `onCompact` and `compaction:ended` get the failure in `error`. Some providers on the OpenAI Responses base have no compaction endpoint.
- After a 404, 405, or 501 (the provider has no compaction endpoint), that adapter object and model use `strategy` until the process restarts. Create the adapter once, outside the request handler, so that no more compaction calls go out.
- After any other failure, such as a 400, a 429, or a network error, the next compaction tries `compact` again.
- The compaction call gets the system prompts of the `chat()` call. It does not get the tools: the compaction endpoint does not take them.
- The compacted messages can hold an encrypted provider item. The adapter sends it back as it is to the same model. Another model does not get it.

The OpenAI Responses adapters have `compact`. See [Native compaction](../adapters/openai#native-compaction).

## Retry after a context overflow

The token count is an estimate, so a call can still be too large for the model. The provider then rejects the call. Catch that one error, give compaction a smaller budget, and call `chat()` again.

Every provider words this error differently, so do not match on the text. The text adapters put one code on the `RUN_ERROR` chunk: `CONTEXT_OVERFLOW_CODE` (`'context_overflow'`). The provider's own text stays in `message`.

```typescript
import { CONTEXT_OVERFLOW_CODE, chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { withCompaction } from "@tanstack/ai-compaction";
import type { ModelMessage } from "@tanstack/ai";

// Each retry gives compaction a smaller budget.
const budgets = [100_000, 50_000, 25_000];

export async function answer(messages: Array<ModelMessage>): Promise<string> {
  let providerError = "";

  for (const maxTokens of budgets) {
    let text = "";
    let overflow = false;

    const stream = chat({
      adapter: openaiText("gpt-5.5"),
      messages,
      middleware: [withCompaction({ maxTokens })],
    });

    for await (const chunk of stream) {
      if (chunk.type === "TEXT_MESSAGE_CONTENT") text += chunk.delta;
      if (chunk.type === "RUN_ERROR") {
        // A smaller budget does not fix any other error.
        if (chunk.code !== CONTEXT_OVERFLOW_CODE) throw new Error(chunk.message);
        overflow = true;
        providerError = chunk.message;
      }
    }

    if (!overflow) return text;
  }

  // Every budget failed. Keep the provider's own message.
  throw new Error(providerError);
}
```

A retry starts the run again from the first message, so tools that ran before the error run again. If a tool sends an email or charges a card, do not retry the run.

The OpenAI, Anthropic, Gemini, Bedrock, OpenRouter, Grok, Cloudflare, and BytePlus adapters set this code. Other OpenAI-compatible adapters set it when the provider sends `context_length_exceeded`.

A call that is too large now gets two more tries. If all three fail, you get the provider's message.

## Options

### withCompaction

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTokens` | `number` | - | **Required.** Compact when the estimated tokens across `messages` pass this. |
| `strategy` | `CompactionStrategy` | `evictOldest()` | How to shrink the messages. |
| `estimateTokens` | `(message: ModelMessage) => number` | characters / 4 | Per-message token estimate. Pass a real tokenizer if you need exact counts. |
| `strategyKey` | `string` | built-in strategy identity | Stable checkpoint identity. Set it for custom strategies, custom estimators, or a custom eviction marker. Change it when your `summarize` function can change. |
| `onCompact` | `(info: CompactionInfo) => void` | - | Runs after each compaction. `info` is `{ before, after, messagesBefore, messagesAfter, error }` (token and message counts). `error` is set when `native` compaction failed and `strategy` ran in its place. |
| `native` | `{ compact?: (options) => Promise<ModelMessage[]> }` | - | The adapter of the `chat()` call. When it has `compact`, the provider compacts in place of `strategy`. See [Let the provider compact](#let-the-provider-compact). |

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
- **It runs before every model call.** Compaction skips `init`. It runs on `beforeModel` and `structuredOutput`. Each later call can compact again.
- **The canonical transcript stays complete.** Compaction writes provider-only context. Persistence and other middleware still read `ctx.messages`.

## DevTools

After a compaction, the chat stream includes three CUSTOM events in order:
`compaction:started`, `compaction:state`, then `compaction:ended`.
`compaction:started` is sent before the strategy runs. Durability flushes each
event as soon as it is emitted, so a slow `summarizeOldest` call still shows
as started on the client while it runs. The state and ended events follow when
the strategy returns.
TanStack AI DevTools has a Compaction tab on the hook. Each compact shows:

- started, state, and ended rows
- when it ran, with token and message counts
- the `maxTokens` budget
- dropped messages
- the transcript sent to the model

The conversation timeline also keeps `onCompactStart`, `onCompact`, and
`onCompactEnd` steps.

Open the AI plugin in the DevTools panel (the `ts-react-chat` example mounts it). Select the Compaction hook, then open the Compaction tab.

The `/compaction` route in `examples/ts-react-chat` uses a small `maxTokens` so this fires after a few turns. It also uses `withPersistence` (SQLite). Reload after a compact: the chat still shows every message. The banner is example UI, not part of `useChat`.

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
