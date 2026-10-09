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

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-openai
vue: @tanstack/ai-openai
solid: @tanstack/ai-openai
svelte: @tanstack/ai-openai
preact: @tanstack/ai-openai
angular: @tanstack/ai-openai
vanilla: @tanstack/ai-openai
octane: @tanstack/ai-openai

<!-- ::end:tabs -->

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

## Azure OpenAI

Your OpenAI model runs as a deployment in Azure? Use `azureOpenaiText`. It calls the Azure Responses API and sends your key in the `api-key` header.

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { azureOpenaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: azureOpenaiText("gpt-5.6", {
      resourceName: "my-resource",
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      deploymentName: "production-chat",
    }),
    messages,
  });

  return toServerSentEventsResponse(stream);
}
```

Azure gets `production-chat` as the model. Your code still uses `gpt-5.6`. The client does not change: it reads this route like any other chat route.

You can also put the values in the environment and leave the config out:

```sh
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_RESOURCE_NAME=my-resource
AZURE_OPENAI_DEPLOYMENT_NAME_MAP=gpt-5.6=production-chat
```

```typescript
import { azureOpenaiText } from "@tanstack/ai-openai";

const adapter = azureOpenaiText("gpt-5.6");
```

If you set a value in both places, this order wins:

- **Endpoint:** `baseURL`, then `resourceName`, then `AZURE_OPENAI_BASE_URL`, then `AZURE_OPENAI_RESOURCE_NAME`. You must set one of them.
- **Key:** `apiKey`, then `AZURE_OPENAI_API_KEY`.
- **API version:** `apiVersion`, then `AZURE_OPENAI_API_VERSION`, then `v1`.
- **Deployment:** `deploymentName`, then `deploymentNameMap`, then `AZURE_OPENAI_DEPLOYMENT_NAME_MAP`, then the model name. A `deploymentNameMap` in the config replaces the environment map. The two maps do not merge.

An Azure resource URL always goes to the `/openai/v1` path. A proxy URL keeps its own path.

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

## Sign in with ChatGPT (BYOK)

Many of your users have a ChatGPT plan but no API key. Let them sign in with ChatGPT. The token bills their ChatGPT plan, not your account.

The helpers in `@tanstack/ai-openai/siwc` put the access token into the `openai` [BYOK](../advanced/byok) slot. Your relay reads it like a pasted key.

Before you start, check these limits:

- OpenAI allows this sign-in only for open-source and locally hosted apps. For a hosted app, fill in the [interest form](https://openai.com/form/sign-in-with-chatgpt-interest/).
- OpenAI redirects only to `127.0.0.1`. Something must answer on that address. Vite listens on `::1` by default. The `ts-react-chat` example runs a small script on `127.0.0.1:3000` that redirects to `localhost:3000`.
- Keep the app on `localhost`, because passkey storage does not work on an IP address. The callback lands on `127.0.0.1`, then `completeChatGptSignIn` sends the browser back to `localhost`.
- The callback page must be at `/auth/callback`.

### 1. Add the sign-in button

Call `startChatGptSignIn` from a click. `agentName` is your app name. OpenAI shows it on the consent screen.

```tsx
import { startChatGptSignIn } from "@tanstack/ai-openai/siwc";

export function ChatGptButton() {
  return (
    <button
      type="button"
      onClick={() => {
        void startChatGptSignIn({ agentName: "My App" });
      }}
    >
      Continue with ChatGPT
    </button>
  );
}
```

### 2. Finish on `/auth/callback`

Render this component on the `/auth/callback` route. It exchanges the code when the page loads. Then the user clicks to save.

```tsx
import { useEffect, useRef, useState } from "react";
import {
  completeChatGptSignIn,
  saveChatGptSignIn,
} from "@tanstack/ai-openai/siwc";
import type { ChatGptSignIn } from "@tanstack/ai-openai/siwc";
import { byok } from "./byok";

export function ChatGptCallback() {
  const started = useRef(false);
  const [signIn, setSignIn] = useState<ChatGptSignIn | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // The code works one time. Strict Mode runs effects two times.
    if (started.current) return;
    started.current = true;
    completeChatGptSignIn().then(setSignIn, (caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "Sign-in failed");
    });
  }, []);

  if (error) return <p>{error}</p>;
  if (!signIn) return <p>Finishing sign-in...</p>;
  return (
    <button
      type="button"
      onClick={() => {
        void saveChatGptSignIn(byok, signIn);
      }}
    >
      Save ChatGPT sign-in
    </button>
  );
}
```

The save needs a click because passkey storage shows a browser prompt. The refresh token goes into a second keyring slot. No send attaches that slot, so the refresh token stays in the browser.

### 3. Refresh the token

The access token lasts one hour. Call `refreshChatGptSignIn` on a timer:

```tsx
import { useEffect } from "react";
import { refreshChatGptSignIn } from "@tanstack/ai-openai/siwc";
import { byok } from "./byok";

export function useChatGptRefresh() {
  useEffect(() => {
    const refresh = () => {
      refreshChatGptSignIn(byok).catch(console.error);
    };
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, []);
}
```

The call does nothing until the token has less than five minutes left. If OpenAI rejects the refresh token, the call clears the sign-in. Then the user must sign in again.

### 4. Read the token on the relay

The relay code is the same as for a pasted key. Add `store: false`, because the ChatGPT route requires it.

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { createOpenaiChat } from "@tanstack/ai-openai";
import { openaiByok } from "@tanstack/ai-openai/byok";
import { byokMissing, getByokKey } from "@tanstack/ai/byok/server";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);
  const apiKey = getByokKey(request, openaiByok);
  if (!apiKey) return byokMissing(openaiByok);

  const stream = chat({
    adapter: createOpenaiChat("gpt-6-astra", apiKey),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    modelOptions: { store: false },
  });
  return toServerSentEventsResponse(stream);
}
```

`store: false` also works with an API key. A ChatGPT token does not start with `sk-`, so use that test if you must send different options.

The ChatGPT route has these limits:

- Use a model that the user's ChatGPT plan includes.
- Do not send `temperature`, `top_p`, `max_output_tokens`, `metadata`, or `previous_response_id`.
- Hosted tools do not work. This includes image generation, file search, code interpreter, computer use, and hosted MCP.
- Audio input and transcription do not work.

Click **Continue with ChatGPT**, approve, save, then send a message. The relay calls OpenAI on the user's ChatGPT plan.

The `ts-react-chat` example has this flow in its key dialog.

## Configuration

```typescript
import { createOpenaiChat, type OpenAITextConfig } from "@tanstack/ai-openai";

const config: Omit<OpenAITextConfig, "apiKey"> = {
  organization: "org-...", // Optional
  baseURL: "https://api.openai.com/v1", // Optional, for custom endpoints
};

const adapter = createOpenaiChat("gpt-5.2", process.env.OPENAI_API_KEY!, config);
```

### Tools that cannot use strict mode

OpenAI holds tool arguments to the schema only when the tool is sent with `strict: true`. Some schemas cannot be strict, for example a schema that uses `$ref`, `z.any()`, or `z.record()`. The adapter sends these tools with `strict: false`, so the tool still works. The model can then return arguments that do not match the schema.

In development, the adapter logs a warning once for each of these tools:

```txt
tool "lookup_user" sent with strict: false: schema uses $ref, which strict mode does not support
```

To get strict mode back, change the schema so that the reason goes away. If you accept a non-strict tool, turn the warning off in the adapter config:

```typescript
import { createOpenaiChat } from "@tanstack/ai-openai";

const adapter = createOpenaiChat("gpt-6-astra", process.env.OPENAI_API_KEY!, {
  strictFallbackWarning: false,
});
```

The warning never runs when `NODE_ENV` is `production`. The same option works on every adapter built on the OpenAI API, for example Groq, Bedrock, and Vercel AI Gateway.
 
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

## Embeddings

Generate embedding vectors with the text-embedding-3 models:

```typescript
import { embed } from "@tanstack/ai";
import { openaiEmbedding } from "@tanstack/ai-openai";

const result = await embed({
  adapter: openaiEmbedding("text-embedding-3-small"),
  input: ["a red guitar", "a blue drum kit"],
});

console.log(result.embeddings[0]?.vector);
console.log(result.usage?.promptTokens);
```

Both models support Matryoshka dimension reduction via the top-level `dimensions` option:

```typescript
import { embed } from "@tanstack/ai";
import { openaiEmbedding } from "@tanstack/ai-openai";

const result = await embed({
  adapter: openaiEmbedding("text-embedding-3-large"),
  input: "a red guitar",
  dimensions: 1024,
});
```

See the [Embeddings guide](../embeddings.md) for the full API.

## Image Generation

Generate images:

```typescript
import { generateImage } from "@tanstack/ai";
import { openaiImage } from "@tanstack/ai-openai";

const result = await generateImage({
  adapter: openaiImage("gpt-image-2"),
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
  adapter: openaiImage("gpt-image-2"),
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

## Evaluate

Sometimes you need an answer that your code can branch on, not chat text. Examples are a queue name, an urgency level, or a yes or no.
Use `openaiDecider` with `decide()` to ask typed questions about one shared `state`. The adapter calls the OpenAI Decisions API (`/v1/decisions`):

```typescript
import { decide, choice, score, boolean } from "@tanstack/ai";
import { openaiDecider } from "@tanstack/ai-openai";

const ticket = {
  subject: "Charged twice for the same invoice",
  body: "Please refund the extra payment.",
};

const result = await decide({
  adapter: openaiDecider("gpt-6-luna"),
  state: ticket,
  questions: {
    queue: choice({
      instructions: "Which team should handle this ticket?",
      options: {
        billing: "Payments, invoices, refunds",
        tech: "Bugs, outages, integrations",
        sales: "Pricing, upgrades, new accounts",
      },
    }),
    urgency: score({
      instructions: "How urgent is this ticket?",
      levels: ["low", "medium", "high"],
    }),
    refund: boolean({
      instructions: "Is the customer asking for a refund?",
    }),
  },
});

console.log(result.queue.value); // "billing"
console.log(result.urgency.value); // "medium"
console.log(result.refund.value); // true
console.log(result.meta.usage);
```

`openaiDecider` reads `OPENAI_API_KEY` from the environment. To pass a key yourself, use `createOpenaiDecider("gpt-6-luna", "sk-...")`.

Good to know:

- `gpt-6-luna` is the only Decisions model.
- An object `state` goes to OpenAI as JSON text.
- If OpenAI refuses to answer a question, `decide()` throws an error with the name of that question.
- `boolean()` criteria work. The adapter adds the true and false meanings to the instructions.

See the [Evaluate guide](../evaluate/evaluate) for question helpers, the result shape, abort, and middleware.

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

### `openaiDecider(model, config?)` / `createOpenaiDecider(model, apiKey, config?)`

Creates an OpenAI evaluate adapter for `decide()`. See [Evaluate](#evaluate) for usage.

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

When the model uses hosted web search, the assistant tool-call part includes
`metadata.providerExecuted: true` and the normalized `metadata.sources` array.
OpenAI's raw search call and URL citations stay under `metadata.openai`. The
agent loop does not execute this call in your application, and the adapter
replays the raw response items on the next turn.

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

The model returns a `local_shell` tool call. Your app runs the command. Then your app sends the output back on the next request. `localShellTool()` takes no arguments. Add it to `tools`.

Match `toolName` on `TOOL_CALL_START`. Read `input` on the `TOOL_CALL_END` with the same `toolCallId`. `input.command` is the command. `input.env` is the environment variables.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { localShellTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-5.6"),
  messages: [{ role: "user", content: "Run the test suite and summarise failures" }],
  tools: [localShellTool()],
});

let localShellCallId: string | undefined;
for await (const chunk of stream) {
  if (chunk.type === "TOOL_CALL_START" && chunk.toolName === "local_shell") {
    localShellCallId = chunk.toolCallId;
  }
  if (chunk.type === "TOOL_CALL_END" && chunk.toolCallId === localShellCallId) {
    console.log(chunk.input);
  }
}
```

Send the command output as the tool result. Use `{ output: string }`, or a string. The next request sends `local_shell_call_output`.

**Supported models:** GPT-5.x and other agent-capable models. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `shellTool`

`shellTool()` gives the model a shell. A container environment runs on OpenAI. A local environment runs in your app.

When your app must run the commands, pass `environment: { type: "local" }`. Match `toolName` on `TOOL_CALL_START`. Read `input` on the `TOOL_CALL_END` with the same `toolCallId`. `input.commands` is the command list. `input.timeout_ms` is the time limit. `input.max_output_length` is the output limit.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { shellTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-5.6"),
  messages: [{ role: "user", content: "Count lines in all JS files" }],
  tools: [shellTool({ environment: { type: "local" } })],
});

let shellCallId: string | undefined;
for await (const chunk of stream) {
  if (chunk.type === "TOOL_CALL_START" && chunk.toolName === "shell") {
    shellCallId = chunk.toolCallId;
  }
  if (chunk.type === "TOOL_CALL_END" && chunk.toolCallId === shellCallId) {
    console.log(chunk.input);
  }
}
```

Return one result per command:

```typescript
const shellResult = {
  output: [
    {
      stdout: "12\n",
      stderr: "",
      outcome: { type: "exit" as const, exit_code: 0 },
    },
  ],
};
```

`outcome.type` is `"exit"` or `"timeout"`. The next request sends `shell_call_output`. If the same response has no `shell_call_output`, a shell call with no environment comes back to your app.

A container environment does not come back as a tool call. Pass `environment` to attach that container and hosted skills.

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

The model returns an `apply_patch` tool call. Your app applies the diff. Then your app sends the result back. `applyPatchTool()` takes no arguments. Add it to `tools`.

Match `toolName` on `TOOL_CALL_START`. Read `input` on the `TOOL_CALL_END` with the same `toolCallId`. `input.operation` is one file change. `operation.type` is `create_file`, `update_file`, or `delete_file`. `operation.path` is the file path. `create_file` and `update_file` also include `operation.diff`.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { applyPatchTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-5.6"),
  messages: [{ role: "user", content: "Fix the import paths in src/index.ts" }],
  tools: [applyPatchTool()],
});

let patchCallId: string | undefined;
for await (const chunk of stream) {
  if (chunk.type === "TOOL_CALL_START" && chunk.toolName === "apply_patch") {
    patchCallId = chunk.toolCallId;
  }
  if (chunk.type === "TOOL_CALL_END" && chunk.toolCallId === patchCallId) {
    console.log(chunk.input);
  }
}
```

Send this object as the tool result. The next request sends `apply_patch_call_output`.

```typescript
const patchResult = {
  status: "completed" as const,
  output: "Updated src/index.ts",
};
```

If the patch fails, set `status` to `"failed"`. Put the error text in `output`. Keep `applyPatchTool()` in `tools` on the next request. A patch-only turn has no text. If you use `chat({ stream: false })`, `text` is empty. Read the `apply_patch` tool call from `chunks` with the same checks as the loop above.

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
