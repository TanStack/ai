---
title: Groq
id: groq-adapter
order: 6
description: "Use the fast Groq inference API in TanStack AI with @tanstack/ai-groq: low-latency chat with Llama, gpt-oss, Qwen, and Kimi, plus Whisper transcription and Orpheus speech."
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

Groq runs open-weight models (Llama, gpt-oss, Qwen, Kimi) with very low latency. It also has Whisper transcription and Orpheus speech.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-groq
vue: @tanstack/ai-groq
solid: @tanstack/ai-groq
svelte: @tanstack/ai-groq
preact: @tanstack/ai-groq
angular: @tanstack/ai-groq
vanilla: @tanstack/ai-groq
octane: @tanstack/ai-groq

<!-- ::end:tabs -->

## 2. Set the API key

Put the key in the environment of your server:

```bash
GROQ_API_KEY=gsk_...
```

`groqText` and the other short factories read `GROQ_API_KEY`. To pass the key in code, use the `create*` factory of the same adapter:

```typescript
import { createGroqText } from "@tanstack/ai-groq";

const adapter = createGroqText("openai/gpt-oss-120b", process.env.GROQ_API_KEY!);
```

## 3. Stream a chat from the server

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { groqText } from "@tanstack/ai-groq";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: groqText("openai/gpt-oss-120b"),
    messages,
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
```

## 4. Render the chat

The client is the same for every provider. Point `useChat` at your route:

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        sendMessage(input);
        setInput("");
      }}
    >
      {messages.map((message) => (
        <p key={message.id}>
          {message.parts
            .map((part) => (part.type === "text" ? part.content : ""))
            .join("")}
        </p>
      ))}
      <input value={input} onChange={(event) => setInput(event.target.value)} />
    </form>
  );
}
```

For Vue, Solid, Svelte, Angular, and the other frameworks, see [Quick Start](../getting-started/quick-start#3-render-the-chat).

You now have a streaming chat on Groq. [Tools](../tools/tools) and [Structured Outputs](../structured-outputs/overview) work the same as with every adapter. For the Groq details of both, see [Tool calls that Groq rejects](#tool-calls-that-groq-rejects) and [Structured output](#structured-output).

## Transcription

`groqTranscription` turns speech into text with Whisper:

```typescript
import { generateTranscription } from "@tanstack/ai";
import { groqTranscription } from "@tanstack/ai-groq";

const result = await generateTranscription({
  adapter: groqTranscription("whisper-large-v3-turbo"),
  audio: "https://example.com/recording.mp3",
  language: "en",
});

console.log(result.text);

// verbose_json (the default) fills language, duration, and timestamped segments
for (const segment of result.segments ?? []) {
  console.log(`[${segment.start}s to ${segment.end}s] ${segment.text}`);
}
```

- `audio` takes a `File`, a `Blob`, an `ArrayBuffer`, a base64 string, a data URL, or an `https://` URL. The adapter sends a URL to Groq as it is, with no new upload.
- Models: `whisper-large-v3-turbo`, `whisper-large-v3`.
- `responseFormat` takes `json`, `text`, or `verbose_json` (the default). Groq does not support `srt` or `vtt`.

See [Transcription](../media/transcription).

## Speech

`groqSpeech` turns text into speech with the Orpheus models:

```typescript
import { generateSpeech } from "@tanstack/ai";
import { groqSpeech } from "@tanstack/ai-groq";

const result = await generateSpeech({
  adapter: groqSpeech("canopylabs/orpheus-v1-english"),
  text: "Hello from Groq!",
  voice: "autumn",
  format: "wav",
});

console.log(result.audio); // Base64-encoded audio
```

- Models: `canopylabs/orpheus-v1-english` and `canopylabs/orpheus-arabic-saudi`.
- English voices: `autumn` (the default), `diana`, `hannah`, `austin`, `daniel`, `troy`.
- Arabic voices: `fahad`, `sultan`, `lulwa`, `noura`.
- Formats: `flac`, `mp3`, `mulaw`, `ogg`, and `wav` (the default). `modelOptions.sample_rate` sets the sample rate.

See [Text-to-Speech](../media/text-to-speech).

## Summarization

```typescript
import { summarize } from "@tanstack/ai";
import { groqSummarize } from "@tanstack/ai-groq";

const result = await summarize({
  adapter: groqSummarize("llama-3.3-70b-versatile"),
  text: "Your long text to summarize...",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});

console.log(result.summary);
```

## No image generation

Groq does not make images. For images, use [OpenAI](./openai) or [Gemini](./gemini). Groq has no provider tools of its own. Define your tools with `toolDefinition()`.

## Models and options

### Model options

Provider options go in `modelOptions`. This includes the sampling options `temperature`, `top_p`, and `max_completion_tokens` (the token limit of Groq):

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

Sampling options do not go at the root of `chat()`. See [Moving Sampling Options into modelOptions](../migration/sampling-options-to-model-options).

### Reasoning

Set how hard a reasoning model thinks with `reasoning` on `chat()`:

```typescript
import { chat } from "@tanstack/ai";
import { groqText } from "@tanstack/ai-groq";

const stream = chat({
  adapter: groqText("openai/gpt-oss-120b"),
  messages: [{ role: "user", content: "Hello!" }],
  reasoning: "medium",
});
```

It goes out as `reasoning_effort`:

- `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `openai/gpt-oss-safeguard-20b`: `low`, `medium`, `high`.
- `qwen/qwen3-32b`: `off` (sent as `none`) and `high` (sent as `default`).

To pick how the thinking text comes back, set `reasoning_format` in `modelOptions`.

### Models

The package exports the full lists as `GROQ_CHAT_MODELS`, `GROQ_TRANSCRIPTION_MODELS`, and `GROQ_TTS_MODELS`.

| Group | Models |
| --- | --- |
| OpenAI gpt-oss | `openai/gpt-oss-120b` (reasoning), `openai/gpt-oss-20b`, `openai/gpt-oss-safeguard-20b` (safety-tuned) |
| Meta Llama | `meta-llama/llama-4-maverick-17b-128e-instruct` (vision), `meta-llama/llama-4-scout-17b-16e-instruct`, `llama-3.3-70b-versatile` (128K context), `llama-3.1-8b-instant` |
| Other | `qwen/qwen3-32b` (reasoning), `moonshotai/kimi-k2-instruct-0905` (256K context) |
| Safety | `meta-llama/llama-guard-4-12b` (content moderation), `meta-llama/llama-prompt-guard-2-86m` and `meta-llama/llama-prompt-guard-2-22m` (prompt injection detection) |

`adapter.inputModalities` lists the input kinds of the selected model. See [Check what a model accepts](../advanced/extend-adapter#check-what-a-model-accepts).

## Advanced

### Configuration

```typescript
import { createGroqText, type GroqTextConfig } from "@tanstack/ai-groq";

const config: Omit<GroqTextConfig, "apiKey"> = {
  baseURL: "https://api.groq.com/openai/v1", // Optional, for custom endpoints
};

const adapter = createGroqText("openai/gpt-oss-120b", process.env.GROQ_API_KEY!, config);
```

Need a header on each request, or a log of each model call? This adapter supports [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call).

### Tool calls that Groq rejects

Groq can reject a tool call from the model with `tool_use_failed`. If the error has a tool call in `failed_generation` that the adapter can rebuild, the adapter does not run the call. It returns the provider error as the result of that tool. The agent loop can then repair the call on its next step. Other provider errors still end the run.

### Structured output

Some Groq models, for example `llama-3.3-70b-versatile`, reject strict JSON schema. For these models, `chat({ outputSchema })` sends `json_object` and adds your schema to the system prompt. Read [When strict JSON schema is rejected](../structured-outputs/overview.md#when-strict-json-schema-is-rejected).

### API reference

Each factory pair has the same shape. The short factory reads `GROQ_API_KEY` from the environment. The `create*` factory takes an explicit API key. Both take `model` as the first argument.

| Factories | Creates |
| --- | --- |
| `groqText(model, config?)` / `createGroqText(model, apiKey, config?)` | Chat adapter |
| `groqSummarize(model, config?)` / `createGroqSummarize(model, apiKey, config?)` | Summarization adapter |
| `groqTranscription(model, config?)` / `createGroqTranscription(model, apiKey, config?)` | Speech-to-text adapter |
| `groqSpeech(model, config?)` / `createGroqSpeech(model, apiKey, config?)` | Text-to-speech adapter |

`config.baseURL` sets a custom base URL for the API requests. `adapter.inputModalities` lists the input kinds of the selected model. It is `undefined` for a model that this package does not know.
