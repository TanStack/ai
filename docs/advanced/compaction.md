---
title: Compaction
id: compaction
order: 3
description: "Keep long chats under the context limit with @tanstack/ai-compaction. withCompaction drops or summarizes old messages before each model call and keeps the recent tail."
keywords:
  - tanstack ai
  - compaction
  - context window
  - middleware
  - token limit
  - summarize history
---

A long chat or a multi-step agent loop keeps adding messages. At some point the transcript passes the model's context limit and the call fails. You want the conversation to keep working without hitting that wall.

`withCompaction` shrinks the history before each model call. It keeps the recent messages as they are and replaces the older ones with a single note. The note is a summary, or a short marker when you drop them. It is an ordinary [`ChatMiddleware`](./middleware), so you add it to the `middleware` array of any `chat()` call.

## Install

```bash
pnpm add @tanstack/ai-compaction
```

## Drop old messages (no extra model call)

This is the cheapest option. Once the transcript passes `maxTokens`, the oldest messages are dropped and replaced with a short marker.

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

## Summarize old messages instead

Dropping messages loses their content. Pass a `summarize` callback to keep a short version of the old history instead. The callback gets the messages that are about to be dropped and returns the summary text.

```typescript
import { chat, summarize, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText, openaiSummarize } from "@tanstack/ai-openai";
import { withCompaction } from "@tanstack/ai-compaction";
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
      withCompaction({ maxTokens: 100_000, summarize: summarizeHistory }),
    ],
  });

  return toServerSentEventsResponse(stream);
}
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTokens` | `number` | - | **Required.** Compact when the estimated tokens across `messages` pass this. |
| `keepRecentTokens` | `number` | `floor(maxTokens / 2)` | Tokens of recent messages to always keep as they are. Must be less than `maxTokens`. |
| `estimateTokens` | `(message: ModelMessage) => number` | characters / 4 | Per-message token estimate. Pass a real tokenizer if you need exact counts. |
| `summarize` | `(messages: ModelMessage[]) => Promise<string>` | - | Summarize the dropped messages. Leave it out to drop them with a marker. |
| `summaryRole` | `'user' \| 'assistant'` | `'user'` | Role of the note that replaces the old messages. |
| `onCompact` | `(info: CompactionInfo) => void` | - | Runs after each compaction. `info` is `{ before, after, droppedMessages, summarized }`. |

The token count is a rough `characters / 4` estimate. It is good enough to trigger on, not exact. Pass `estimateTokens` for provider-accurate counts.

## What it keeps safe

- **The system prompt is never dropped.** `chat()` keeps it separate from `messages`, so compaction only touches the conversation.
- **Tool calls stay paired with their results.** The kept tail never starts with an orphaned tool result, so the request stays valid.
- **It runs before every model call.** Compaction is incremental: as the chat keeps growing it compacts again, and a later pass folds an earlier summary into the new one.

## Next steps

- [Middleware](./middleware): the full hook reference and how middleware composes
- [Built-in Middleware](./built-in-middleware): ready-made middleware that ships in `@tanstack/ai`
