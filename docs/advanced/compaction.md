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
| `summarizeOldest` | Replace the oldest messages with an LLM summary | One summarize call (up to two with `cut: 'turn'`) |
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

async function summarizeHistory(messages: Array<ModelMessage>) {
  const text = messages
    .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : ""}`)
    .join("\n");

  // Return the whole result. Compaction reports its `usage`.
  return summarize({
    adapter: openaiSummarize("gpt-6.1-sol"),
    text,
  });
}

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
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

`summarize` can return the summary text, or an object with `summary` and `usage`. Return the `summarize()` result as it is, so compaction can report what the summary cost.

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

A strategy is a function. It gets the messages and the budget, and returns the rewritten messages, or `null` to change nothing. It runs when the count is over `maxTokens`, and when `compactNext` forces it. Then the count can be under `maxTokens`.

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

## When the chat is still too long

The token count is an estimate. So once in a while a call is still too long for the model, and the provider rejects it.

You do not have to catch that error. When a call fails with `CONTEXT_OVERFLOW_CODE`, `withCompaction` compacts and calls the model again, in the same run. Your code only sees the answer. This works with `auto: false` too.

It retries once per model call. If the compacted call is still too long, the run ends with a `RUN_ERROR`:

- `code` is `CONTEXT_OVERFLOW_CODE` (`'context_overflow'`).
- `message` is the provider's own text.

The OpenAI, Anthropic, Gemini, Bedrock, OpenRouter, Grok, Cloudflare, and BytePlus adapters set this code. Other OpenAI-compatible adapters set it when the provider sends `context_length_exceeded`.

### Give the retry something to cut

The retry compacts even under `maxTokens`. But a strategy can still find nothing to cut:

- `composeStrategies` stops when the estimate is under `maxTokens`.
- `evictOldest` keeps `maxTokens / 2` by default.

Set a small `keepRecentTokens`, so the retry always drops something:

```typescript
import { evictOldest, withCompaction } from "@tanstack/ai-compaction";

withCompaction({
  maxTokens: 100_000,
  strategy: evictOldest({ keepRecentTokens: 20_000 }),
});
```

### Compact on your own schedule

Want the next call on a thread to compact, even under `maxTokens`? Call `compactNext(threadId)`. For example, do this before you switch the thread to a model with a smaller context window.

Create the middleware once, so `compactNext` reaches the same instance:

```typescript
import { withCompaction } from "@tanstack/ai-compaction";

const compaction = withCompaction({ maxTokens: 100_000 });

// The next model call on this thread compacts first.
compaction.compactNext("thread-1");
```

## Options

### withCompaction

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTokens` | `number` | - | **Required.** Compact when the token count of `messages` passes this. See `countTokens`. |
| `strategy` | `CompactionStrategy` | `evictOldest()` | How to shrink the messages. |
| `estimateTokens` | `(message: ModelMessage) => number` | characters / 4 | Per-message token estimate. Pass a real tokenizer if you need exact counts. |
| `strategyKey` | `string` | built-in strategy identity | Stable checkpoint identity. Set it for custom strategies, custom estimators, or a custom eviction marker. Change it when your `summarize` function can change. |
| `onCompact` | `(info: CompactionInfo) => void` | - | Runs after each compaction. `info` is `{ before, after, messagesBefore, messagesAfter, reason, usage, error, stale }`. `error` is set when the check after a run fails, a background summary fails, or `native` compaction failed and `strategy` ran in its place. `stale` is set when a background summary no longer fits. |
| `countTokens` | `'estimate' \| 'usage'` | `'estimate'` | `'usage'` counts with the usage the provider reported for the last call. See [Count with real usage](#count-with-real-usage). |
| `auto` | `boolean` | `true` | `false` turns off compaction at `maxTokens`. `compactNext`, the overflow retry, and the overflow check still run. |
| `contextWindow` | `number` | - | The model's context window. With `countTokens: 'usage'` and `durable: true` on a host with a session log, compaction also runs after a run whose usage passed it, even with `auto: false`. |
| `durable` | `boolean` | `false` | On a host with a session log, write the result into the log. See [Keep compaction in a session log](#keep-compaction-in-a-session-log). |
| `continueOnError` | `boolean` | `false` | When the strategy fails, send the full messages and go on. By default the run fails. |
| `background` | `{ atTokens: number }` | - | Prepare the summary when the count passes `atTokens`, and apply it at the next run. `atTokens` must be below `maxTokens`. See [Prepare the summary in the background](#prepare-the-summary-in-the-background). |
| `native` | `{ compact?: (options) => Promise<ModelMessage[]> }` | - | The adapter of the `chat()` call. When it has `compact`, the provider compacts in place of `strategy`. See [Let the provider compact](#let-the-provider-compact). |

### Strategy options

| Strategy | Options |
|----------|---------|
| `evictOldest` | `keepRecentTokens` (default `maxTokens / 2`), `marker` |
| `summarizeOldest` | `summarize` (**required**), `keepRecentTokens`, `summaryRole` (default `assistant`), `cut` (default `'message'`) |
| `clearToolResults` | `keepRecentToolResults` (default `3`), `stub` |

The token count is a rough `characters / 4` estimate. It is good enough to trigger on, not exact. Pass `estimateTokens` for provider-accurate counts.

## Count with real usage

The `characters / 4` estimate drifts on long agent runs. Code, JSON, and other languages do not split into tokens like English text. Then compaction runs too late and the call fails, or it runs too early and drops context you still need.

Set `countTokens: 'usage'`. After each model call, compaction saves the usage that the provider reported. The next check starts from that number and estimates only the messages that came after it.

```ts group=compaction-usage
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withCompaction } from '@tanstack/ai-compaction'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    middleware: [withCompaction({ maxTokens: 100_000, countTokens: 'usage' })],
  })

  return toServerSentEventsResponse(stream)
}
```

- Before the first model call there is no usage yet, so compaction uses the estimate.
- With a [`metadata` store](#compaction-and-persistence), the usage is saved. The next request and a restarted server start from the real count.
- The strategies still use the estimate to choose which messages to keep.

## Set the limit from the context window

Most models publish a context window. Keep room for the answer: set `maxTokens` to the window minus a reserve.

```ts group=compaction-usage
import { summarizeOldest } from '@tanstack/ai-compaction'
import { summarize } from '@tanstack/ai'
import { openaiSummarize } from '@tanstack/ai-openai'

const contextWindow = 200_000
const reserveTokens = 20_000

const windowed = withCompaction({
  maxTokens: contextWindow - reserveTokens,
  contextWindow,
  countTokens: 'usage',
  strategy: summarizeOldest({
    keepRecentTokens: 8_000,
    summarize: (messages) =>
      summarize({
        adapter: openaiSummarize('gpt-6.1-sol'),
        text: messages
          .map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : ''}`)
          .join('\n'),
      }),
  }),
})
```

| You want | Set |
|---|---|
| Compact before the context passes the window minus a reserve | `maxTokens: contextWindow - reserveTokens` |
| Keep the newest messages word for word | `keepRecentTokens` on the strategy |
| On a host with a session log: no automatic compaction, but recovery from a silent overflow | `auto: false`, `contextWindow`, `countTokens: 'usage'`, `durable: true` |

Some providers accept a request that is too large. They cut the input and answer without an error. On a host with a [session log](#keep-compaction-in-a-session-log), compaction with `countTokens: 'usage'` and `durable: true` checks once more after the last model call of a run. If the usage passed `maxTokens` or `contextWindow`, it compacts right away, so the next run starts small. With `auto: false`, only `contextWindow` counts. The answer is not sent again. The only extra model calls are the summary calls.

Without a session log, there is no check after a run. The next request compacts before its first model call.

## Prepare the summary in the background

A `summarizeOldest` call takes time. When compaction runs at `maxTokens`, the user waits for that call before the model answers. Set `background` to prepare the summary earlier, while the chat goes on:

```ts group=compaction-background
import { chat, summarize, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiSummarize, openaiText } from '@tanstack/ai-openai'
import { summarizeOldest, withCompaction } from '@tanstack/ai-compaction'

// Create it once, so a summary from one request reaches the next.
const compaction = withCompaction({
  maxTokens: 100_000,
  background: { atTokens: 80_000 },
  strategy: summarizeOldest({
    summarize: (messages) =>
      summarize({
        adapter: openaiSummarize('gpt-6.1-sol'),
        text: messages
          .map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : ''}`)
          .join('\n'),
      }),
  }),
})

export async function POST(request: Request) {
  const { messages, threadId } = await request.json()

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    middleware: [compaction],
  })

  return toServerSentEventsResponse(stream)
}
```

- `atTokens` must be below `maxTokens`. If it is not, `withCompaction` throws.
- When the count at a model call passes `atTokens`, the summary starts on a copy of the messages. The model call does not wait for it.
- The ready summary waits in the [`metadata` store](#compaction-and-persistence), under the namespace `@tanstack/ai-compaction:background`. Without a store, it waits in memory.
- The summary applies at the first model call of the next run on the same `threadId`, never in the middle of a run.
- A model call over `maxTokens` while the summary runs waits for it and applies it. It compacts inline only when the messages are still over `maxTokens`. A cancel of the run stops the wait, not the summary.

Sometimes a summary does not apply:

- A newer compaction cut past the message that the summary keeps. The summary is dropped and reported with `stale: true`.
- The summary call failed. Nothing applies, and the failure is reported with `error`. The next model call past `atTokens` starts a new summary.

`onCompact` always gets these reports. A `compaction:ended` event for a failed summary reaches the stream only while the run that started the summary still runs.

## What it keeps safe

- **The system prompt is never dropped.** `chat()` keeps it separate from `messages`, so compaction only touches the conversation.
- **Tool calls stay paired with their results.** The built-in strategies never leave an orphaned tool result, so the request stays valid.
- **It runs before every model call.** Compaction skips `init`. It runs on `beforeModel` and `structuredOutput`. Each later call can compact again.
- **The canonical transcript stays complete.** Compaction writes provider-only context. Persistence and other middleware still read `ctx.messages`.

## Better summaries

The basic `summarizeOldest` setup works for a chat. A coding agent needs more. It must keep the goal, the decisions, and the files it touched across many compactions. Three opt-in parts help:

1. `cut: 'turn'` on `summarizeOldest`: a better summary when the cut falls inside a turn. The older turns get one summary. The start of the current turn gets its own short summary, under `## Turn context`.
2. `conversationSummarizer`: a ready summarizer with a structured prompt (goal, constraints, progress, key decisions, next steps, critical context). When an older summary exists, it updates that summary. It reports the usage of each summary call.
3. `details` on `conversationSummarizer`: your own facts after the summary, for example the files the agent read. The next compaction gets them back as `previousDetails`.

```ts group=compaction-better
import { openaiText } from '@tanstack/ai-openai'
import {
  conversationSummarizer,
  summarizeOldest,
  withCompaction,
} from '@tanstack/ai-compaction'

function pathOf(args: string) {
  const input: unknown = JSON.parse(args)
  return typeof input === 'object' &&
    input !== null &&
    'path' in input &&
    typeof input.path === 'string'
    ? input.path
    : undefined
}

const agentCompaction = withCompaction({
  maxTokens: 180_000,
  contextWindow: 200_000,
  countTokens: 'usage',
  strategy: summarizeOldest({
    cut: 'turn',
    keepRecentTokens: 8_000,
    summarize: conversationSummarizer({
      adapter: openaiText('gpt-6.1-sol'),
      details: ({ messages, previousDetails }) => {
        const files = new Set(previousDetails?.split('\n').filter(Boolean))
        for (const message of messages) {
          for (const call of message.toolCalls ?? []) {
            const path =
              call.function.name === 'read_file'
                ? pathOf(call.function.arguments)
                : undefined
            if (path) files.add(path)
          }
        }
        return files.size > 0 ? [...files].join('\n') : undefined
      },
    }),
  }),
})
```

- In the text sent to the summarizer, each tool result is cut to 2,000 characters. Set `maxToolResultChars` to change it.
- A `summarize` function of your own gets a second argument, `summarize(messages, input)`:
  - `previousSummary` and `previousDetails`: the older summary and its details.
  - `turnPrefix`: `true` when the call summarizes the start of the current turn.
  - `turnPrefixMessages`: the start of the current turn. Only the call that writes the details gets it, so the details cover each dropped message.
  - `signal`: aborts when the run aborts.

## DevTools

After a compaction, the chat stream includes three CUSTOM events in order:
`compaction:started`, `compaction:state`, then `compaction:ended`.
`compaction:started` is sent before the strategy runs. Durability flushes each
event as soon as it is emitted, so a slow `summarizeOldest` call still shows
as started on the client while it runs. The state and ended events follow when
the strategy returns.

`compaction:ended` also says why compaction ran and what it cost:

- `reason`: `'threshold'` (the count passed `maxTokens`), `'forced'` (`compactNext`, or the retry after a context overflow), or `'background'` (a [background summary](#prepare-the-summary-in-the-background)).
- `usage`: the token usage of the summary calls.
- `error`: the message when the strategy failed. By default the run then fails. Set `continueOnError: true` to send the full messages instead.
- `stale`: `true` when a ready background summary no longer fit the messages and was dropped.

A compaction after the last model call of a run has `reason: 'after-turn'`. The stream is closed by then, so only `onCompact` reports it. A failed strategy or `onCompact` there does not fail the run, because the answer is complete. Only a failed write to the log fails it.

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

With `durable: true` on a host with a session log, compaction writes its result into the log instead. See [Keep compaction in a session log](#keep-compaction-in-a-session-log).

## Keep compaction in a session log

Some hosts keep a durable log for each thread and rebuild the model context from it when a session opens again. A metadata checkpoint can miss on that rebuild. Set `durable: true` so the compaction goes into the log, and the rebuilt session sees the same context.

1. The host provides `LogRecordsCapability`. See [Append records to the session log](./middleware#append-records-to-the-session-log).
2. Add `withCompaction({ durable: true })` to the same `chat()` call.
3. Fold each compaction record into the messages with `projectCompaction`: for the next model call, and when the host rebuilds the session.

```ts group=compaction-durable
import type { ModelMessage } from '@tanstack/ai'
import { projectCompaction, withCompaction } from '@tanstack/ai-compaction'

const compaction = withCompaction({
  maxTokens: 180_000,
  contextWindow: 200_000,
  countTokens: 'usage',
  durable: true,
})

type LogEntry =
  | { kind: 'message'; message: ModelMessage }
  | { kind: 'record'; record: { type: string; [key: string]: unknown } }

// Fold the log in order. A compaction record replaces the messages before it.
function contextOf(log: Array<LogEntry>): Array<ModelMessage> {
  let messages: Array<ModelMessage> = []
  for (const entry of log) {
    if (entry.kind === 'message') messages = [...messages, entry.message]
    else messages = projectCompaction({ messages, record: entry.record }) ?? messages
  }
  return messages
}
```

- Each compaction writes one record with the type `'tanstack.compaction'` (`COMPACTION_RECORD_TYPE`). The host must accept this type.
- `projectCompaction` returns `undefined` for a record of another type, and for a record that does not fit the messages. Then keep the messages as they are.
- Without the fold for the next model call, each later call of the run compacts the full list again.
- The log only grows, so the original messages stay in the store.
- Without `LogRecordsCapability`, compaction uses the metadata checkpoint, and there is no check after the run.

## Next steps

- [Middleware](./middleware): the full hook reference and how middleware composes
- [Built-in Middleware](./built-in-middleware): ready-made middleware that ships in `@tanstack/ai`
