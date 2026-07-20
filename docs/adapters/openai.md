---
title: OpenAI
id: openai-adapter
order: 1
description: "Use OpenAI models with TanStack AI — GPT-4o, GPT-5, DALL-E image generation, TTS, and Whisper transcription via @tanstack/ai-openai."
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

The OpenAI adapter provides access to OpenAI's models, including GPT-4o, GPT-5, image generation (DALL-E), text-to-speech (TTS), and audio transcription (Whisper).

> Using a third-party provider that speaks the OpenAI API (DeepSeek, Moonshot/Kimi, Together, Fireworks, a local LM Studio/vLLM server, …)? See the [OpenAI-Compatible Adapter](./openai-compatible) for a generic `openaiCompatible({ baseURL, apiKey, models })` factory.

## Installation

```bash
npm install @tanstack/ai-openai
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Chat Completions API

`@tanstack/ai-openai` ships two text adapters that hit different OpenAI endpoints. `openaiText` (default) calls the Responses API (`/v1/responses`). `openaiChatCompletions` calls the older Chat Completions API (`/v1/chat/completions`).

Pick whichever fits your wire format and feature needs:

| | `openaiText` (Responses) | `openaiChatCompletions` (Chat Completions) |
|---|---|---|
| Endpoint | `/v1/responses` | `/v1/chat/completions` |
| Reasoning summaries | Yes — set `modelOptions.reasoning.summary: 'auto'` to surface reasoning text via `REASONING_*` events | No — reasoning tokens are still consumed but cannot be exposed |
| Wire-format compatibility | OpenAI-only | Matches the older de-facto industry shape (Grok, Groq, OpenRouter, many local model servers) |
| Structured output streaming | `text.format: { type: 'json_schema', strict: true }` + `stream: true` | `response_format: { type: 'json_schema', strict: true }` + `stream: true` |

Use `openaiText` when you want reasoning-summary streaming or OpenAI-specific Responses features. Use `openaiChatCompletions` when you're migrating off a Chat-Completions-style provider, share request-building code with other Chat-Completions adapters in your stack, or want the more battle-tested wire format.

```typescript
import { chat } from "@tanstack/ai";
import { openaiChatCompletions } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiChatCompletions("gpt-5.2"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

With an explicit API key:

```typescript
import { chat } from "@tanstack/ai";
import { createOpenaiChatCompletions } from "@tanstack/ai-openai";

const adapter = createOpenaiChatCompletions("gpt-5.2", process.env.OPENAI_API_KEY!, {
  // organization, baseURL, headers — all optional
});

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
});
```

Both adapters work identically with [Structured Outputs](../structured-outputs/overview) — including `stream: true` — and accept the same `modelOptions` (temperature, top_p, max_tokens, stop, …). The reasoning section below applies to `openaiText`; `openaiChatCompletions` accepts `modelOptions.reasoning.effort` but cannot stream summary text.

## Basic Usage - Custom API Key

```typescript
import { chat } from "@tanstack/ai";
import { createOpenaiChat } from "@tanstack/ai-openai";

const adapter = createOpenaiChat("gpt-5.2", process.env.OPENAI_API_KEY!, {
  // ... your config options
});

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Configuration

```typescript
import { createOpenaiChat, type OpenAITextConfig } from "@tanstack/ai-openai";

const config: Omit<OpenAITextConfig, "apiKey"> = {
  organization: "org-...", // Optional
  baseURL: "https://api.openai.com/v1", // Optional, for custom endpoints
};

const adapter = createOpenaiChat("gpt-5.2", process.env.OPENAI_API_KEY!, config);
```
 
## Example: Chat Completion

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText("gpt-5.2"),
    messages,
  });

  return toServerSentEventsResponse(stream);
}
```

## Example: With Tools

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
  // Fetch weather data
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

## Model Options

OpenAI supports various provider-specific options. Sampling parameters live here too — `temperature`, `top_p`, and `max_output_tokens` (the Responses API token-limit key) — rather than as root-level props on `chat()`:

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

> The `openaiChatCompletions` adapter targets `/v1/chat/completions`, where the token-limit key is `max_tokens` (not `max_output_tokens`). If you previously passed `temperature` / `topP` / `maxTokens` at the root of `chat()`, see [Moving Sampling Options into modelOptions](../migration/sampling-options-to-model-options).

### Reasoning

Enable reasoning for models that support it (e.g., GPT-5, O3). This allows the model to show its reasoning process, which is streamed as `thinking` chunks:

```typescript ignore
modelOptions: {
  reasoning: {
    effort: "medium", // "none" | "minimal" | "low" | "medium" | "high"
    summary: "detailed", // "auto" | "detailed" (optional)
  },
}
```

When reasoning is enabled, the model's reasoning process is streamed separately from the response text and appears as a collapsible thinking section in the UI.

## Summarization

Summarize long text content:

```typescript
import { summarize } from "@tanstack/ai";
import { openaiSummarize } from "@tanstack/ai-openai";

const result = await summarize({
  adapter: openaiSummarize("gpt-5-mini"),
  text: "Your long text to summarize...",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});

console.log(result.summary);
```

## Image Generation

Generate images with DALL-E:

```typescript
import { generateImage } from "@tanstack/ai";
import { openaiImage } from "@tanstack/ai-openai";

const result = await generateImage({
  adapter: openaiImage("gpt-image-1"),
  prompt: "A futuristic cityscape at sunset",
  numberOfImages: 1,
  size: "1024x1024",
});

console.log(result.images);
```

### Image Model Options

```typescript
import { generateImage } from "@tanstack/ai";
import { openaiImage } from "@tanstack/ai-openai";

const result = await generateImage({
  adapter: openaiImage("gpt-image-1"),
  prompt: "...",
  modelOptions: {
    quality: "high", // "high" | "medium" | "low" | "auto"
  },
});
```

## Text-to-Speech

Generate speech from text:

```typescript
import { generateSpeech } from "@tanstack/ai";
import { openaiSpeech } from "@tanstack/ai-openai";

const result = await generateSpeech({
  adapter: openaiSpeech("tts-1"),
  text: "Hello, welcome to TanStack AI!",
  voice: "alloy",
  format: "mp3",
});

// result.audio contains base64-encoded audio
console.log(result.format); // "mp3"
```

### TTS Voices

Available voices: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`, `ash`, `ballad`, `coral`, `sage`, `verse`

### TTS Model Options

```typescript
import { generateSpeech } from "@tanstack/ai";
import { openaiSpeech } from "@tanstack/ai-openai";

const result = await generateSpeech({
  adapter: openaiSpeech("tts-1-hd"),
  text: "High quality speech",
  modelOptions: {
    instructions: "Speak slowly and clearly.", // voice instructions (not supported by tts-1/tts-1-hd)
  },
});
```

## Transcription

Transcribe audio to text:

```typescript
import { generateTranscription } from "@tanstack/ai";
import { openaiTranscription } from "@tanstack/ai-openai";
import { audioFile } from "./audio";

const result = await generateTranscription({
  adapter: openaiTranscription("whisper-1"),
  audio: audioFile, // File object or base64 string
  language: "en",
});

console.log(result.text); // Transcribed text
```

### Transcription Model Options

```typescript
import { generateTranscription } from "@tanstack/ai";
import { openaiTranscription } from "@tanstack/ai-openai";
import { audioFile } from "./audio";

const result = await generateTranscription({
  adapter: openaiTranscription("whisper-1"),
  audio: audioFile,
  responseFormat: "verbose_json",
  prompt: "Technical terms: API, SDK",
  modelOptions: {
    temperature: 0,
    timestamp_granularities: ["word", "segment"],
  },
});

// Access the transcribed text
console.log(result.text);
```

### Speaker Diarization

Use `gpt-4o-transcribe-diarize` for speaker-labeled transcripts:

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

When no response format is specified, `gpt-4o-transcribe-diarize` requests default to `response_format: "diarized_json"` and `chunking_strategy: "auto"`; passing a top-level `responseFormat` of `"json"` or `"text"` opts out of speaker segments. `known_speaker_names` and `known_speaker_references` must be provided together (up to 4, matching lengths). OpenAI does not support `prompt`, `include`, or `timestamp_granularities` with diarized transcription.

## Environment Variables

Set your API key in environment variables:

```bash
OPENAI_API_KEY=sk-...
```

## API Reference

Every factory pair follows the same shape: the short factory (`openaiText`, `openaiImage`, …) reads `OPENAI_API_KEY` from the environment, while the `create*` variant takes an explicit API key. Both take `model` as the first argument.

### `openaiText(model, config?)`

Creates an OpenAI text adapter against the Responses API (`/v1/responses`) using `OPENAI_API_KEY` from the environment.

**Parameters:**

- `model` - OpenAI chat model id (e.g. `"gpt-5.2"`, `"gpt-4o-mini"`)
- `config?.organization` - Organization ID (optional)
- `config?.baseURL` - Custom base URL (optional)

### `createOpenaiChat(model, apiKey, config?)`

Creates an OpenAI text adapter (Responses API) with an explicit API key.

### `openaiChatCompletions(model, config?)`

Creates an OpenAI text adapter that targets `/v1/chat/completions` instead of the Responses API. See [Chat Completions API](#chat-completions-api) for when to use this over `openaiText`.

### `createOpenaiChatCompletions(model, apiKey, config?)`

Creates an OpenAI chat-completions adapter with an explicit API key.

### `openaiSummarize(model, config?)` / `createOpenaiSummarize(model, apiKey, config?)`

Creates an OpenAI summarization adapter.

### `openaiImage(model, config?)` / `createOpenaiImage(model, apiKey, config?)`

Creates an OpenAI image generation adapter (DALL-E, gpt-image).

### `openaiSpeech(model, config?)` / `createOpenaiSpeech(model, apiKey, config?)`

Creates an OpenAI text-to-speech adapter.

### `openaiTranscription(model, config?)` / `createOpenaiTranscription(model, apiKey, config?)`

Creates an OpenAI transcription adapter for Whisper, GPT-4o transcription, and GPT-4o diarized transcription models.

### `openaiVideo(model, config?)` / `createOpenaiVideo(model, apiKey, config?)`

Creates an OpenAI video generation adapter (Sora). _Experimental._

### `openaiRealtime(...)` / `openaiRealtimeToken(...)`

Realtime voice adapters. See [Realtime Voice Chat](../media/realtime-chat) for usage.

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../tools/tools) - Learn about tools
- [Other Adapters](./anthropic) - Explore other providers

## Provider Tools

OpenAI exposes several native tools beyond user-defined function calls.
Import them from `@tanstack/ai-openai/tools` and pass them into
`chat({ tools: [...] })`.

> For the full concept, a comparison matrix, and type-gating details, see
> [Provider Tools](../tools/provider-tools.md).

### `webSearchTool`

Enables the model to run a web search and return grounded results with
citations. Pass a `WebSearchToolConfig` object (typed from the OpenAI SDK)
to configure the tool.

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

**Supported models:** GPT-4o, GPT-5, and Responses API-capable models. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `webSearchPreviewTool`

The preview variant of web search with additional options for controlling
search context size and user location. Use this when you want fine-grained
control over the search context sent to the model.

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

**Supported models:** GPT-4o and above. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `fileSearchTool`

Searches OpenAI vector stores that you have pre-populated, letting the model
retrieve relevant document chunks. Provide the `vector_store_ids` to search
and optionally limit results with `max_num_results` (1–50).

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

**Supported models:** GPT-4o and above. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `imageGenerationTool`

Allows the model to generate images inline during a conversation using
DALL-E/GPT-Image. Pass quality, size, and style options via the config object.

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

**Supported models:** GPT-5 and GPT-Image-capable models. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `codeInterpreterTool`

Gives the model a sandboxed Python execution environment. The `container`
field configures the execution environment; pass the full
`CodeInterpreterToolConfig` object.

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

**Supported models:** GPT-4o and above. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `mcpTool`

Connects the model to a remote MCP (Model Context Protocol) server, exposing
all its capabilities as callable tools. Provide either `server_url` or
`connector_id` — not both.

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

**Supported models:** GPT-4o and above. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `computerUseTool`

Lets the model observe a virtual desktop via screenshots and interact with
it using keyboard and mouse events. Provide the display dimensions and the
execution environment type.

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

**Supported models:** `computer-use-preview`. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `localShellTool`

Provides the model with a local shell for executing system commands. Takes no
arguments — the tool is enabled simply by including it in the `tools` array.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { localShellTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Run the test suite and summarise failures" }],
  tools: [localShellTool()],
});
```

**Supported models:** GPT-5.x and other agent-capable models. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `shellTool`

A function-style shell tool that exposes shell execution as a structured
function call. Pass an `environment` object to attach container config and
hosted skills.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { shellTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Count lines in all JS files" }],
  tools: [shellTool()],
});
```

**Supported models:** GPT-5.x and other agent-capable models. Responses API
only — Chat Completions does not support the shell tool. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

#### Attaching hosted skills

Pass `environment.skills` to load provider-managed skill bundles into the
shell's container (Responses API only).

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

For the full reference — skill shape, `version` string format, and the
Anthropic equivalent — see [Provider Skills](../tools/provider-skills.md).

### `applyPatchTool`

Lets the model apply unified-diff patches to modify files directly. Takes no
arguments — include it in the `tools` array to enable patch application.

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

**Supported models:** GPT-5.x and other agent-capable models. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `customTool`

Defines a custom Responses API tool with an explicit name, description, and
format. Use this when none of the structured tool types fits your use case.
Unlike branded provider tools, `customTool` returns a plain `Tool` and is
accepted by any chat model.

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

**Supported models:** all Responses API models. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).
