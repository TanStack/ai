---
title: OpenAI
id: openai-adapter
order: 1
description: "OpenAI GPT, images, TTS, Whisper, and provider tools via @tanstack/ai-openai."
keywords:
  - tanstack ai
  - openai
  - gpt-4o
  - gpt-5
  - dall-e
  - whisper
  - openai tts
  - adapter
  - chatgpt
---

If you need OpenAI → install, set `OPENAI_API_KEY`, call `openaiText(model)`.

Third-party OpenAI-compatible APIs → [OpenAI-Compatible Adapter](./openai-compatible).

## Install

```bash
npm install @tanstack/ai-openai
```

```bash
OPENAI_API_KEY=sk-...
```

## Do this

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Explicit API key

```typescript
import { chat } from "@tanstack/ai";
import { createOpenaiChat } from "@tanstack/ai-openai";

const adapter = createOpenaiChat("gpt-5.2", process.env.OPENAI_API_KEY!, {
  // organization, baseURL
});

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Server + tools

```typescript
import { chat, toServerSentEventsResponse, toolDefinition } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get the current weather",
  inputSchema: z.object({
    location: z.string(),
  }),
});

const getWeather = getWeatherDef.server(async ({ location }) => {
  return { temperature: 72, conditions: "sunny" };
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText("gpt-5.2"),
    messages,
    tools: [getWeather],
  });

  return toServerSentEventsResponse(stream);
}
```

## Chat Completions vs Responses

| | `openaiText` (default) | `openaiChatCompletions` |
|---|---|---|
| Endpoint | `/v1/responses` | `/v1/chat/completions` |
| Reasoning summaries | Yes (`reasoning.summary: 'auto'`) | Effort only, no streamed summary |
| Wire format | OpenAI-only | Industry Chat Completions shape |
| Structured streaming | `text.format` + `stream: true` | `response_format` + `stream: true` |

Use Responses for reasoning-summary streaming. Use Chat Completions when migrating or sharing code with other Completions adapters.

```typescript
import { chat } from "@tanstack/ai";
import { openaiChatCompletions } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiChatCompletions("gpt-5.2"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

```typescript
import { chat } from "@tanstack/ai";
import { createOpenaiChatCompletions } from "@tanstack/ai-openai";

const adapter = createOpenaiChatCompletions("gpt-5.2", process.env.OPENAI_API_KEY!);

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
});
```

Both support [Structured Outputs](../structured-outputs/overview).

## Model options

Responses token limit: `max_output_tokens`. Completions: `max_tokens`.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    temperature: 0.7,
    max_output_tokens: 1000,
    top_p: 0.9,
  },
});
```

> Root-level sampling migration: [modelOptions](../migration/sampling-options-to-model-options).

### Reasoning

```typescript ignore
modelOptions: {
  reasoning: {
    effort: "medium", // "none" | "minimal" | "low" | "medium" | "high"
    summary: "detailed", // "auto" | "detailed"
  },
}
```

Streams as thinking chunks.

## Summarization

```typescript
import { summarize } from "@tanstack/ai";
import { openaiSummarize } from "@tanstack/ai-openai";

const result = await summarize({
  adapter: openaiSummarize("gpt-5-mini"),
  text: "Your long text to summarize...",
  maxLength: 100,
  style: "concise",
});

console.log(result.summary);
```

## Image

```typescript
import { generateImage } from "@tanstack/ai";
import { openaiImage } from "@tanstack/ai-openai";

const result = await generateImage({
  adapter: openaiImage("gpt-image-2"),
  prompt: "A futuristic cityscape at sunset",
  numberOfImages: 1,
  size: "1024x1024",
  modelOptions: {
    quality: "high", // "high" | "medium" | "low" | "auto"
  },
});

console.log(result.images);
```

## Text-to-speech

Voices: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`, `ash`, `ballad`, `coral`, `sage`, `verse`.

```typescript
import { generateSpeech } from "@tanstack/ai";
import { openaiSpeech } from "@tanstack/ai-openai";

const result = await generateSpeech({
  adapter: openaiSpeech("tts-1"),
  text: "Hello, welcome to TanStack AI!",
  voice: "alloy",
  format: "mp3",
});

console.log(result.format);
```

`instructions` in `modelOptions` not supported on `tts-1` / `tts-1-hd`.

## Transcription

```typescript
import { generateTranscription } from "@tanstack/ai";
import { openaiTranscription } from "@tanstack/ai-openai";
import { audioFile } from "./audio";

const result = await generateTranscription({
  adapter: openaiTranscription("whisper-1"),
  audio: audioFile,
  language: "en",
  responseFormat: "verbose_json",
  prompt: "Technical terms: API, SDK",
  modelOptions: {
    temperature: 0,
    timestamp_granularities: ["word", "segment"],
  },
});

console.log(result.text);
```

### Speaker diarization

```typescript
import { generateTranscription } from "@tanstack/ai";
import { openaiTranscription } from "@tanstack/ai-openai";
import { meetingAudioFile } from "./audio";

const result = await generateTranscription({
  adapter: openaiTranscription("gpt-4o-transcribe-diarize"),
  audio: meetingAudioFile,
  modelOptions: {
    known_speaker_names: ["agent", "customer"],
    known_speaker_references: [
      "data:audio/wav;base64,...",
      "data:audio/wav;base64,...",
    ],
  },
});

for (const segment of result.segments ?? []) {
  console.log(segment.speaker, segment.start, segment.end, segment.text);
}
```

Default for diarize: `response_format: "diarized_json"` + `chunking_strategy: "auto"`. `known_speaker_names` + `known_speaker_references` together (≤4, matching lengths). No `prompt` / `include` / `timestamp_granularities` with diarized.

## API reference

Short factories use `OPENAI_API_KEY`; `create*` takes explicit key.

| Factory | Purpose |
| --- | --- |
| `openaiText` / `createOpenaiChat` | Responses API chat |
| `openaiChatCompletions` / `createOpenaiChatCompletions` | Chat Completions |
| `openaiSummarize` / `createOpenaiSummarize` | Summarize |
| `openaiImage` / `createOpenaiImage` | Image |
| `openaiSpeech` / `createOpenaiSpeech` | TTS |
| `openaiTranscription` / `createOpenaiTranscription` | STT |
| `openaiVideo` / `createOpenaiVideo` | Sora (experimental) |
| `openaiRealtime` / `openaiRealtimeToken` | [Realtime](../media/realtime-chat) |

Config: `organization?`, `baseURL?`.

## Provider tools

From `@tanstack/ai-openai/tools`. Matrix: [Provider Tools](../tools/provider-tools.md).

### `webSearchTool`

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { webSearchTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "What's new in AI this week?" }],
  tools: [webSearchTool({ type: "web_search" })],
});
```

### `webSearchPreviewTool`

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { webSearchPreviewTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Latest news about TypeScript" }],
  tools: [
    webSearchPreviewTool({
      type: "web_search_preview_2025_03_11",
      search_context_size: "high",
    }),
  ],
});
```

### `fileSearchTool`

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { fileSearchTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "What does the handbook say about PTO?" }],
  tools: [
    fileSearchTool({
      type: "file_search",
      vector_store_ids: ["vs_abc123"],
      max_num_results: 5,
    }),
  ],
});
```

### `imageGenerationTool`

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { imageGenerationTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Draw a logo for my app" }],
  tools: [
    imageGenerationTool({
      quality: "high",
      size: "1024x1024",
    }),
  ],
});
```

### `codeInterpreterTool`

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { codeInterpreterTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Analyse this CSV and plot a chart" }],
  tools: [
    codeInterpreterTool({ type: "code_interpreter", container: { type: "auto" } }),
  ],
});
```

### `mcpTool`

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { mcpTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "List my GitHub issues" }],
  tools: [
    mcpTool({
      server_url: "https://mcp.example.com",
      server_label: "github",
    }),
  ],
});
```

Provide `server_url` **or** `connector_id`, not both.

### `computerUseTool`

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { computerUseTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("computer-use-preview"),
  messages: [{ role: "user", content: "Open Chrome and navigate to example.com" }],
  tools: [
    computerUseTool({
      type: "computer_use_preview",
      display_width: 1024,
      display_height: 768,
      environment: "browser",
    }),
  ],
});
```

### `localShellTool` / `shellTool`

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { localShellTool, shellTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Run the test suite and summarise failures" }],
  tools: [localShellTool()],
});
```

`shellTool` supports hosted skills via `environment.skills` (Responses only). See [Provider Skills](../tools/provider-skills.md).

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { shellTool } from "@tanstack/ai-openai/tools";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText("gpt-5.2"),
    messages,
    tools: [
      shellTool({
        environment: {
          type: "container_auto",
          skills: [
            { type: "skill_reference", skill_id: "skill_abc", version: "2" },
          ],
        },
      }),
    ],
  });

  return toServerSentEventsResponse(stream);
}
```

### `applyPatchTool`

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { applyPatchTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Fix the import paths in src/index.ts" }],
  tools: [applyPatchTool()],
});
```

### `customTool`

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { customTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Look up order #1234" }],
  tools: [
    customTool({
      type: "custom",
      name: "lookup_order",
      description: "Look up the status of a customer order by order ID",
    }),
  ],
});
```

## Next steps

- [Getting Started](../getting-started/quick-start)
- [Tools](../tools/tools)
- [Other Adapters](./anthropic)
