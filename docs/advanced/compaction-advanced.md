---
title: "Compaction: Advanced"
id: compaction-advanced
description: "Every compaction option, custom strategies, real token counts, background summaries, DevTools events, checkpoints, and session logs."
keywords:
  - tanstack ai
  - compaction
  - context window
  - countTokens
  - summarizeOldest
  - session log
---

This page covers the details of compaction that you need only for special cases. Set up the basics first with [Compaction](./compaction).

## Options

### withCompaction

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTokens` | `number` | - | **Required.** Compact when the token count of `messages` passes this. See `countTokens`. |
| `strategy` | `CompactionStrategy` | `evictOldest()` | How to shrink the messages. |
| `estimateTokens` | `(message: ModelMessage) => number` | characters / 4 | The token estimate for one message. Pass a real tokenizer to get exact counts. |
| `strategyKey` | `string` | identity of the built-in strategy | A stable identity for checkpoints. Set it for custom strategies, custom estimators, or a custom eviction marker. Change it when your `summarize` function can change. |
| `onCompact` | `(info: CompactionInfo) => void` | - | Runs after each compaction. See [onCompact](#oncompact). |
| `countTokens` | `'estimate' \| 'usage'` | `'estimate'` | `'usage'` counts with the usage that the provider reported for the last call. See [Count with real usage](#count-with-real-usage). |
| `auto` | `boolean` | `true` | `false` turns off compaction at `maxTokens`. `compactNext`, the overflow retry, and the check after a run still compact. |
| `contextWindow` | `number` | - | The context window of the model. See [Set the limit from the context window](#set-the-limit-from-the-context-window). |
| `durable` | `boolean` | `false` | On a host with a session log, write the result into the log. See [Keep compaction in a session log](#keep-compaction-in-a-session-log). |
| `continueOnError` | `boolean` | `false` | When the strategy fails, send the full messages and continue. By default the run fails. |
| `background` | `{ atTokens: number }` | - | Prepare the summary when the count passes `atTokens`, and apply it at the next run. See [Prepare the summary in the background](#prepare-the-summary-in-the-background). |
| `native` | `{ compact?: (options) => Promise<ModelMessage[]> }` | - | The adapter of the `chat()` call. When it has `compact`, the provider compacts in place of `strategy`. See [Let the provider compact](./compaction#let-the-provider-compact). |

### Strategy options

| Strategy | Options |
|----------|---------|
| `evictOldest` | `keepRecentTokens` (default `maxTokens / 2`), `marker` |
| `summarizeOldest` | `summarize` (**required**), `keepRecentTokens` (default `maxTokens / 2`), `summaryRole` (default `'assistant'`), `cut` (default `'message'`) |
| `clearToolResults` | `keepRecentToolResults` (default `3`), `stub` |

The token count is a rough `characters / 4` estimate. It is good enough to start a compaction, but it is not exact. Pass `estimateTokens` to get counts that match the provider.

### onCompact

`onCompact` gets `{ before, after, messagesBefore, messagesAfter, reason, usage, error, stale }`:

- `before` and `after`: the estimated tokens.
- `reason`: why it ran. See [DevTools events](#devtools-events).
- `usage`: the token usage of the summary calls.
- `error`: set when the check after a run fails, when a background summary fails, or when `native` compaction failed and `strategy` ran in its place.
- `stale`: set when a background summary does not fit the current messages.

## Write your own strategy

A strategy is a function. It gets the messages and the budget. It returns the rewritten messages, or `null` to change nothing.

It runs when the count is over `maxTokens`. It also runs when `compactNext` forces it, so the count can be under `maxTokens`.

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

The second argument of the strategy has:

- `maxTokens`: the budget.
- `estimate`: the shared token estimator.
- `addUsage`: report the usage of a model call that the strategy made, for example a summary.
- `signal`: aborts when the run is cancelled. Pass it to a model call.

If you use a custom strategy with persistence, set `strategyKey`. When the strategy can give a different output, change the key. Then an old checkpoint cannot use stale behavior.

## Native compaction failures

These rules apply when you pass `native` (see [Let the provider compact](./compaction#let-the-provider-compact)):

- When `compact` fails, `strategy` runs in its place. `onCompact` and `compaction:ended` get the failure in `error`. Some providers on the OpenAI Responses base have no compaction endpoint.
- After a 404, 405, or 501 (the provider has no compaction endpoint), that adapter object and model use `strategy` until the process restarts. Create the adapter once, outside the request handler, so that no more compaction calls go out.
- After any other failure, such as a 400, a 429, or a network error, the next compaction tries `compact` again.
- The compaction call gets the system prompts of the `chat()` call. It does not get the tools, because the compaction endpoint does not accept them.
- The compacted messages can hold an encrypted provider item. The adapter sends it back unchanged to the same model. Another model does not get it.

## Give the retry something to cut

After a context overflow, the retry compacts even under `maxTokens`. But a strategy can still find nothing to cut:

- `composeStrategies` stops when the estimate is under `maxTokens`.
- `evictOldest` keeps `maxTokens / 2` by default.

Set a small `keepRecentTokens`, so that the retry always drops something:

```typescript
import { evictOldest, withCompaction } from "@tanstack/ai-compaction";

withCompaction({
  maxTokens: 100_000,
  strategy: evictOldest({ keepRecentTokens: 20_000 }),
});
```

## Compact on your own schedule

Call `compactNext(threadId)` to make the next call on a thread compact, even under `maxTokens`. For example, do this before you switch the thread to a model with a smaller context window.

Create the middleware once, so that `compactNext` reaches the same instance:

```typescript
import { withCompaction } from "@tanstack/ai-compaction";

const compaction = withCompaction({ maxTokens: 100_000 });

// The next model call on this thread compacts first.
compaction.compactNext("thread-1");
```

## Count with real usage

The `characters / 4` estimate drifts on long agent runs. Code, JSON, and other languages do not split into tokens like English text. Then compaction runs too late and the call fails. Or it runs too early and drops context that you still need.

Set `countTokens: 'usage'`. After each model call, compaction saves the usage that the provider reported. The next check starts from that number and estimates only the messages after it.

```ts
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

- Before the first model call, there is no usage. Compaction uses the estimate.
- With a [`metadata` store](#checkpoints), compaction saves the usage. The next request and a restarted server start from the real count.
- The strategies still use the estimate to choose which messages to keep.

## Set the limit from the context window

Most models publish a context window. Keep room for the answer: set `maxTokens` to the window minus a reserve.

```ts
import { summarize } from '@tanstack/ai'
import { openaiSummarize } from '@tanstack/ai-openai'
import { summarizeOldest, withCompaction } from '@tanstack/ai-compaction'

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

Some providers accept a request that is too large. They cut the input and answer without an error.

On a host with a [session log](#keep-compaction-in-a-session-log), compaction with `countTokens: 'usage'` and `durable: true` checks once more after the last model call of a run. If the usage passed `maxTokens` or `contextWindow`, it compacts immediately, so the next run starts small.

- With `auto: false`, only `contextWindow` counts.
- The answer is not sent again. The only extra model calls are the summary calls.
- Without a session log, there is no check after a run. The next request compacts before its first model call.

## Prepare the summary in the background

A `summarizeOldest` call takes time. When compaction runs at `maxTokens`, the user waits for that call before the model answers. Set `background` to prepare the summary earlier, while the chat continues:

```ts
import { chat, summarize, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiSummarize, openaiText } from '@tanstack/ai-openai'
import { summarizeOldest, withCompaction } from '@tanstack/ai-compaction'

// Create it once, so that a summary from one request reaches the next.
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

How the background summary runs:

- `atTokens` must be less than `maxTokens`. If it is not, `withCompaction` throws.
- When the count at a model call passes `atTokens`, the summary starts on a copy of the messages. The model call does not wait for it.
- The ready summary waits in the [`metadata` store](#checkpoints), under the namespace `@tanstack/ai-compaction:background`. Without a store, it waits in memory.
- The summary applies at the first model call of the next run on the same `threadId`, never in the middle of a run.
- A model call over `maxTokens` while the summary runs waits for it and applies it. It compacts inline only when the messages are still over `maxTokens`. A cancel of the run stops the wait, not the summary.

Sometimes a summary does not apply:

- A newer compaction cut past the message that the summary keeps. The summary is dropped and reported with `stale: true`.
- The summary call failed. Nothing applies, and the failure is reported with `error`. The next model call past `atTokens` starts a new summary.

`onCompact` always gets these reports. A `compaction:ended` event for a failed summary reaches the stream only while the run that started the summary still runs.

## Better summaries

The basic `summarizeOldest` setup works for a chat. A coding agent needs more. It must keep the goal, the decisions, and the files that it touched across many compactions. Three opt-in parts help:

1. `cut: 'turn'` on `summarizeOldest` gives a better summary when the cut falls inside a turn. The older turns get one summary. The start of the current turn gets its own short summary, under `## Turn context`.
2. `conversationSummarizer` is a ready summarizer with a structured prompt (goal, constraints, progress, key decisions, next steps, critical context). When an older summary exists, it updates that summary. It reports the usage of each summary call.
3. `details` on `conversationSummarizer` adds your own facts after the summary, for example the files that the agent read. The next compaction gets them back as `previousDetails`.

```ts
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

- In the text that goes to the summarizer, each tool result is cut to 2,000 characters. Set `maxToolResultChars` to change this limit.
- Your own `summarize` function gets a second argument, `summarize(messages, input)`:
  - `previousSummary` and `previousDetails`: the older summary and its details.
  - `turnPrefix`: `true` when the call summarizes the start of the current turn.
  - `turnPrefixMessages`: the start of the current turn. Only the call that writes the details gets it, so the details cover each dropped message.
  - `signal`: aborts when the run aborts.

## DevTools events

After a compaction, the chat stream includes three CUSTOM events in this order:

1. `compaction:started`: sent before the strategy runs.
2. `compaction:state`: the result, with counts and previews.
3. `compaction:ended`: why it ran and what it cost.

Durability flushes each event when it is emitted. So a slow `summarizeOldest` call still shows as started on the client while it runs.

`compaction:ended` has these fields:

- `reason`: `'threshold'` (the count passed `maxTokens`), `'forced'` (`compactNext`, or the retry after a context overflow), or `'background'` (a [background summary](#prepare-the-summary-in-the-background)).
- `usage`: the token usage of the summary calls.
- `error`: the message when the strategy failed. By default the run then fails. Set `continueOnError: true` to send the full messages instead.
- `stale`: `true` when a ready background summary did not fit the current messages and was dropped.

A compaction after the last model call of a run has `reason: 'after-turn'`. The stream is closed by then, so only `onCompact` reports it. A failed strategy or `onCompact` there does not fail the run, because the answer is complete. Only a failed write to the log fails it.

TanStack AI DevTools has a Compaction tab on the hook. Each compaction shows:

- started, state, and ended rows
- when it ran, with token and message counts
- the `maxTokens` budget
- dropped messages
- the transcript sent to the model

The conversation timeline also keeps `onCompactStart`, `onCompact`, and `onCompactEnd` steps.

To see it:

1. Open the AI plugin in the DevTools panel. The `ts-react-chat` example mounts it.
2. Select the Compaction hook.
3. Open the Compaction tab.

The `/compaction` route in `examples/ts-react-chat` uses a small `maxTokens`, so compaction runs after a few turns. It also uses `withPersistence` (SQLite). Reload after a compaction: the chat still shows every message. The banner is example UI, not part of `useChat`.

## Checkpoints

If the persistence adapter has a `metadata` store, compaction saves a small checkpoint:

- The next request makes sure that the start of the transcript did not change.
- Then it restores the last compacted result and adds only the new messages.
- A changed start of the transcript, or a changed strategy key, makes the checkpoint invalid.

When compaction reuses a checkpoint, a later `summarizeOldest` pass sees the previous summary plus new messages. Then it merges the old summary into the new one. This merge needs a metadata store and a strategy key.

These strategies get a strategy key automatically:

- The default strategy and standard `evictOldest`.
- `summarizeOldest` and `clearToolResults`.
- Safe compositions of the strategies above.

Set `strategyKey` for custom strategies, custom estimators, or custom marker functions. When your `summarize` function can change, change `strategyKey` too. Without a metadata store or a safe key, compaction stays stateless.

With `durable: true` on a host with a session log, compaction writes its result into the log instead. See the next section.

## Keep compaction in a session log

Some hosts keep a durable log for each thread. They rebuild the model context from it when a session opens again. A metadata checkpoint can miss on that rebuild. Set `durable: true` so that the compaction goes into the log, and the rebuilt session sees the same context.

1. Make sure that the host provides `LogRecordsCapability`. See [Append records to the session log](./middleware-advanced#append-records-to-the-session-log).
2. Add `withCompaction({ durable: true })` to the same `chat()` call.
3. Fold each compaction record into the messages with `projectCompaction`: for the next model call, and when the host rebuilds the session.

```ts
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
