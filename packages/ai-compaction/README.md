# @tanstack/ai-compaction

Context-window compaction as a `chat()` middleware. When the working message set
grows past `maxTokens`, it keeps the recent tail verbatim and replaces the older
head with a single note — a **summary** (if you pass `summarize`) or an
**eviction marker**. It runs before every model call, so compaction is
incremental and rolling: a later compaction re-folds the previous summary into
the next one. The system prompt is untouched (`chat()` keeps it separate from
`messages`).

```bash
npm install @tanstack/ai-compaction
```

## Evict (cheapest — no extra model call)

```ts
import { chat } from '@tanstack/ai'
import { withCompaction } from '@tanstack/ai-compaction'

chat({
  adapter,
  messages,
  middleware: [withCompaction({ maxTokens: 100_000 })],
})
```

## Summarize the dropped head

Pass a `summarize` callback — wire it to a cheap model.

```ts
import { chat, generate } from '@tanstack/ai'
import { withCompaction } from '@tanstack/ai-compaction'

const summarize = async (msgs) => {
  const { text } = await generate({
    adapter,
    messages: [
      ...msgs,
      { role: 'user', content: 'Summarize the conversation above in a few sentences.' },
    ],
  })
  return text
}

chat({
  adapter,
  messages,
  middleware: [withCompaction({ maxTokens: 100_000, summarize })],
})
```

## Options

| Option | Default | What it does |
|---|---|---|
| `maxTokens` | — (required) | Compact when estimated tokens exceed this. |
| `keepRecentTokens` | `floor(maxTokens / 2)` | Recent tokens always kept verbatim. Must be `< maxTokens`. |
| `estimateTokens` | chars / 4 | Per-message token estimate. Swap in a real tokenizer for accuracy. |
| `summarize` | — | Summarize the dropped head. Omit to evict with a marker. |
| `summaryRole` | `'user'` | Role of the injected note. |
| `onCompact` | — | Observe each compaction (`before`/`after`/`droppedMessages`/`summarized`). |

The token estimate is a rough `chars / 4` heuristic — good enough to trigger on,
not exact. Pass `estimateTokens` if you need provider-accurate counts.
