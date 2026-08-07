---
title: Groq
id: groq-adapter
order: 6
description: "Groq fast chat inference and Whisper transcription via @tanstack/ai-groq."
keywords:
  - tanstack ai
  - groq
  - fast inference
  - llama
  - low latency
  - adapter
  - llm
  - whisper
  - transcription
---

If you need Groq → install, set `GROQ_API_KEY`, call `groqText(model)`.

## Install

```bash
npm install @tanstack/ai-groq
```

```bash
GROQ_API_KEY=gsk_...
```

## Do this

```typescript
import { chat } from "@tanstack/ai";
import { groqText } from "@tanstack/ai-groq";

const stream = chat({
  adapter: groqText("llama-3.3-70b-versatile"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Explicit API key

```typescript
import { chat } from "@tanstack/ai";
import { createGroqText } from "@tanstack/ai-groq";

const adapter = createGroqText(
  "llama-3.3-70b-versatile",
  process.env.GROQ_API_KEY!,
);

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Server

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { groqText } from "@tanstack/ai-groq";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: groqText("llama-3.3-70b-versatile"),
    messages,
  });

  return toServerSentEventsResponse(stream);
}
```

### With tools

```typescript
import { chat, toolDefinition, type ModelMessage } from "@tanstack/ai";
import { groqText } from "@tanstack/ai-groq";
import { z } from "zod";

const searchDatabaseDef = toolDefinition({
  name: "search_database",
  description: "Search the database",
  inputSchema: z.object({
    query: z.string(),
  }),
});

const searchDatabase = searchDatabaseDef.server(async ({ query }) => {
  return { results: [] };
});

const messages: Array<ModelMessage> = [
  { role: "user", content: "Search for something" },
];

const stream = chat({
  adapter: groqText("llama-3.3-70b-versatile"),
  messages,
  tools: [searchDatabase],
});
```

## Transcription

`audio`: `File`, `Blob`, `ArrayBuffer`, base64, data URL, or `https://` URL. Models: `whisper-large-v3-turbo`, `whisper-large-v3`. Formats: `json`, `text`, `verbose_json` (default). No `srt`/`vtt`.

```typescript
import { generateTranscription } from "@tanstack/ai";
import { groqTranscription } from "@tanstack/ai-groq";

const result = await generateTranscription({
  adapter: groqTranscription("whisper-large-v3-turbo"),
  audio: "https://example.com/recording.mp3",
  language: "en",
});

console.log(result.text);
for (const segment of result.segments ?? []) {
  console.log(`[${segment.start}s → ${segment.end}s] ${segment.text}`);
}
```

See [Transcription](../media/transcription).

## Model options

Token limit key: `max_completion_tokens`.

```typescript
import { chat } from "@tanstack/ai";
import { groqText } from "@tanstack/ai-groq";

const stream = chat({
  adapter: groqText("llama-3.3-70b-versatile"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    temperature: 0.7,
    max_completion_tokens: 1024,
    top_p: 0.9,
  },
});
```

> Root-level sampling migration: [modelOptions](../migration/sampling-options-to-model-options).

### Reasoning

e.g. `openai/gpt-oss-120b`, `qwen/qwen3-32b`:

```typescript ignore
modelOptions: {
  reasoning_effort: "medium", // "none" | "default" | "low" | "medium" | "high"
}
```

## Models

**Must-know:**

- `llama-3.3-70b-versatile` — 128K, capable
- `llama-3.1-8b-instant` — fast/cheap
- `meta-llama/llama-4-maverick-17b-128e-instruct` — vision
- `openai/gpt-oss-120b` — reasoning
- `qwen/qwen3-32b` — reasoning

**Also:** Llama Guard / Prompt Guard, `openai/gpt-oss-20b`, `openai/gpt-oss-safeguard-20b`, `moonshotai/kimi-k2-instruct-0905`, Llama 4 Scout, etc.

## API reference

| Factory | Purpose |
| --- | --- |
| `groqText` / `createGroqText` | Chat (`config.baseURL?`) |
| `groqTranscription` / `createGroqTranscription` | STT |

## Notes

- No TTS / image generation — use OpenAI, Gemini, fal, or ElevenLabs

No provider-tool factories — use `toolDefinition()` ([tools](../tools/tools.md)).

## Next steps

- [Getting Started](../getting-started/quick-start)
- [Tools](../tools/tools)
- [Other Adapters](./openai)
