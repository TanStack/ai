# @tanstack/ai-compaction

Context-window compaction as a `chat()` middleware. When the working message set
grows past `maxTokens`, `withCompaction` runs a pluggable **strategy** that
rewrites the messages. It runs before every model call, so compaction is
incremental and rolling. The system prompt is untouched (`chat()` keeps it
separate from `messages`).

```bash
npm install @tanstack/ai-compaction
```

## Quick start

The default strategy (`evictOldest`) drops the oldest messages and keeps the
recent ones.

```ts
import { chat } from '@tanstack/ai'
import { withCompaction } from '@tanstack/ai-compaction'

chat({
  adapter,
  messages,
  middleware: [withCompaction({ maxTokens: 100_000 })],
})
```

## Strategies

Pass `strategy` to change how the history shrinks. Three are built in.

| Strategy                | What it does                                            | Cost                |
| ----------------------- | ------------------------------------------------------- | ------------------- |
| `evictOldest` (default) | Drop the oldest messages, leave a marker                | No extra model call |
| `summarizeOldest`       | Replace the oldest messages with an LLM summary         | One summarize call  |
| `clearToolResults`      | Stub the content of old tool results, keep the messages | No extra model call |

```ts
import {
  withCompaction,
  evictOldest,
  summarizeOldest,
  clearToolResults,
} from '@tanstack/ai-compaction'

// Tune how much recent history to keep.
withCompaction({
  maxTokens: 100_000,
  strategy: evictOldest({ keepRecentTokens: 40_000 }),
})

// Summarize instead of dropping. `summarize` gets the messages being removed.
withCompaction({
  maxTokens: 100_000,
  strategy: summarizeOldest({ summarize: (msgs) => summarizeToText(msgs) }),
})

// Best for agent loops: stub old tool output, keep the messages in place.
withCompaction({
  maxTokens: 100_000,
  strategy: clearToolResults({ keepRecentToolResults: 5 }),
})
```

### Combine them

`composeStrategies` runs strategies in order and escalates: it stops once the
result is back under `maxTokens`. Put the cheap one first.

```ts
import {
  withCompaction,
  composeStrategies,
  clearToolResults,
  evictOldest,
} from '@tanstack/ai-compaction'

// Clear old tool output first; only drop old messages if that isn't enough.
withCompaction({
  maxTokens: 100_000,
  strategy: composeStrategies(clearToolResults(), evictOldest()),
})
```

### Write your own

A strategy gets the messages and the budget, and returns the rewritten messages
(or `null` to change nothing). It runs only when the estimate is over
`maxTokens`.

```ts
import type { CompactionStrategy } from '@tanstack/ai-compaction'

const keepLastOnly: CompactionStrategy = (messages) =>
  messages.length <= 1 ? null : messages.slice(-1)
```

## Options

### `withCompaction`

| Option           | Default         | What it does                                                                 |
| ---------------- | --------------- | ---------------------------------------------------------------------------- |
| `maxTokens`      | (required)      | Compact when estimated tokens exceed this.                                   |
| `strategy`       | `evictOldest()` | How to shrink the messages.                                                  |
| `estimateTokens` | chars / 4       | Per-message token estimate. Swap in a real tokenizer for accuracy.           |
| `onCompact`      | —               | Observe each compaction (`before`/`after`/`messagesBefore`/`messagesAfter`). |

### Strategy options

| Strategy           | Options                                                   |
| ------------------ | --------------------------------------------------------- |
| `evictOldest`      | `keepRecentTokens` (default `maxTokens / 2`), `marker`    |
| `summarizeOldest`  | `summarize` (required), `keepRecentTokens`, `summaryRole` |
| `clearToolResults` | `keepRecentToolResults` (default `3`), `stub`             |

The token estimate is a rough `chars / 4` heuristic, good enough to trigger on,
not exact. Pass `estimateTokens` if you need provider-accurate counts.
