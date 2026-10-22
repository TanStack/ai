---
title: Google Gemini
id: gemini-adapter
order: 3
description: "Use Google Gemini in TanStack AI with @tanstack/ai-gemini: multimodal chat with thinking, native and Imagen images, speech, embeddings, video understanding, and Google tools."
keywords:
  - tanstack ai
  - gemini
  - google gemini
  - imagen
  - nano banana
  - image generation
  - adapter
  - google ai
---

The Gemini adapter calls Gemini for multimodal chat, thinking, and Google tools. It also calls image, speech, embedding, music, and video models.

Need Gemini on Vertex AI, for regional endpoints and Google Cloud credentials? Use the [Vertex adapter](./vertex).

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-gemini
vue: @tanstack/ai-gemini
solid: @tanstack/ai-gemini
svelte: @tanstack/ai-gemini
preact: @tanstack/ai-gemini
angular: @tanstack/ai-gemini
vanilla: @tanstack/ai-gemini
octane: @tanstack/ai-gemini

<!-- ::end:tabs -->

## 2. Set the API key

1. Open [Google AI Studio](https://aistudio.google.com/apikey).
2. Create an API key.
3. Put the key in the environment of your server:

```bash
GEMINI_API_KEY=your-api-key-here
```

The short factories (`geminiText`, `geminiImage`, and the others) read `GOOGLE_API_KEY` first, then `GEMINI_API_KEY`. To pass the key in code, use the `create*` factory of the same adapter:

```typescript
import { createGeminiChat } from "@tanstack/ai-gemini";

const adapter = createGeminiChat("gemini-3.8-flash", process.env.GEMINI_API_KEY!);
```

## 3. Stream a chat from the server

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: geminiText("gemini-3.8-flash"),
    messages,
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
```

`gemini-3.8-flash` takes text, images, audio, video, and documents. It supports thinking, built-in tools, structured output, and caching.

## 4. Render the chat

The client is the same for every provider. Point `useChat` at your route:

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
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

You now have a streaming Gemini chat. [Tools](../tools/tools) and [Structured Outputs](../structured-outputs/overview) work the same as with every adapter.

## Images

`geminiImage` takes two model groups:

- **Gemini native image models** (Nano Banana), such as `gemini-nano-banana-2.1`. You set an aspect ratio and a resolution tier in `size`, for example `"16:9_4K"`. You can edit the last image with a short prompt.
- **Imagen models**, such as `imagen-4.0-generate-001`. You set `size` as WIDTHxHEIGHT.

```typescript
import { generateImage } from "@tanstack/ai";
import { geminiImage } from "@tanstack/ai-gemini";

const result = await generateImage({
  adapter: geminiImage("gemini-nano-banana-2.1"),
  prompt: "A futuristic cityscape at sunset",
  threadId: "thread-1",
  numberOfImages: 1,
  size: "16:9_4K",
});

console.log(result.images);
```

The sizes of each model, image edits, and the image options are on [Gemini: Advanced](./gemini-advanced#images). For a full app, see the [media generation example](https://github.com/TanStack/ai/tree/main/examples/ts-react-media).

## Video understanding

Ask questions about a video: "what happens at 0:30?", "summarize the demo", "list every product shown". A video is too large to send inline, so upload it to the Gemini Files API first:

- `uploadGeminiFile()` uploads the file and waits until it is ready.
- `geminiVideoPart()` turns that upload into a content part for a message.

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { geminiText, uploadGeminiFile, geminiVideoPart } from "@tanstack/ai-gemini";

export async function POST(request: Request) {
  const file = await uploadGeminiFile("./demo.mp4", { mimeType: "video/mp4" });

  const stream = chat({
    adapter: geminiText("gemini-3.8-flash"),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", content: "Summarize this video and cite timestamps." },
          geminiVideoPart(file),
        ],
      },
    ],
    threadId: "thread-1",
  });

  return toServerSentEventsResponse(stream);
}
```

To change the frame rate, cut a clip, or let the model explore the video, see [Video understanding options](./gemini-advanced#video-understanding-options).

## Speech

Gemini speech is experimental.

```typescript
import { generateSpeech } from "@tanstack/ai";
import { geminiSpeech } from "@tanstack/ai-gemini";

const result = await generateSpeech({
  adapter: geminiSpeech("gemini-3.1-flash-tts-preview"),
  text: "Hello from Gemini TTS!",
  threadId: "thread-1",
});

console.log(result.audio); // Base64 encoded audio
```

For a dialogue with two voices, see [Speech with two speakers](./gemini-advanced#speech-with-two-speakers).

## Embeddings

```typescript
import { embed } from "@tanstack/ai";
import { geminiEmbedding } from "@tanstack/ai-gemini";

const result = await embed({
  adapter: geminiEmbedding("gemini-embedding-001"),
  input: "a red guitar",
  dimensions: 1536,
  modelOptions: {
    taskType: "RETRIEVAL_DOCUMENT",
  },
});

console.log(result.embeddings[0]?.vector);
```

- The embedding endpoint of the Gemini API does not report token usage, so `result.usage` is absent.
- This adapter does not support `multimodalembedding@001`, which is a Vertex-only model.

See the [Embeddings guide](../embeddings.md).

## Summarization

```typescript
import { summarize } from "@tanstack/ai";
import { geminiSummarize } from "@tanstack/ai-gemini";

const result = await summarize({
  adapter: geminiSummarize("gemini-3.1-pro-preview"),
  text: "Your long text to summarize...",
  threadId: "thread-1",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});

console.log(result.summary);
```

## Music, video, voice, and files

- **Music**: `geminiAudio` makes music with the Lyria models. Experimental. See [Audio Generation](../media/audio-generation).
- **Video**: `geminiVideo` makes videos with Veo and Gemini Omni. Experimental. See [Video Generation](../media/video-generation).
- **Realtime voice**: `geminiRealtime` and `geminiRealtimeToken` run a live voice chat. See [Realtime Voice Chat](../media/realtime-chat).
- **Files**: `geminiFiles` uploads media to the Gemini Files API. See [Files API](../advanced/files-api).

## Provider tools

Gemini runs some tools itself, such as Google Search and a code sandbox. Import them from `@tanstack/ai-gemini/tools` and add them to `tools`:

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { googleSearchTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-3.8-flash"),
  messages: [{ role: "user", content: "What's the weather in Tokyo right now?" }],
  threadId: "thread-1",
  tools: [googleSearchTool()],
});
```

Tools that search or read:

- `googleSearchTool` and `googleSearchRetrievalTool`: search Google.
- `googleMapsTool`: find places and directions.
- `urlContextTool`: read the URLs in the conversation.
- `fileSearchTool`: search files in Gemini file search stores.

Tools that act:

- `codeExecutionTool`: run Python in a sandbox.
- `computerUseTool`: control a virtual desktop.

Each tool, with a full sample, is on [Gemini: Advanced](./gemini-advanced#provider-tools). For which models take which tool, see [Provider Tools](../tools/provider-tools.md).

## Models and options

### Model options

Provider options go in `modelOptions`, with the camelCase names of the Gemini SDK. This includes the sampling options `temperature`, `topP`, and `maxOutputTokens`:

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";

const stream = chat({
  adapter: geminiText("gemini-3.8-flash"),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
  modelOptions: {
    maxOutputTokens: 2048,
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    stopSequences: ["END"],
  },
});
```

- For JSON output, set `responseMimeType: "application/json"`. For typed output, use [Structured Outputs](../structured-outputs/overview).
- Sampling options do not go at the root of `chat()`. See [Moving Sampling Options into modelOptions](../migration/sampling-options-to-model-options).

### Reasoning

Want Gemini to think harder? Set `reasoning` on `chat()`:

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";

const stream = chat({
  adapter: geminiText("gemini-3.8-flash"),
  messages: [{ role: "user", content: "Plan a database migration." }],
  threadId: "thread-1",
  reasoning: "high",
});
```

What goes to Gemini:

- Gemini 3 models: `thinkingConfig.thinkingLevel`.
- Gemini 2.5 models: `thinkingConfig.thinkingBudget`. Set it with `budgetTokens`, or the level picks it. `off` sends a budget of `0`.
- `summary` sets `thinkingConfig.includeThoughts`, so the thinking text streams.
- `geminiTextInteractions`: `generation_config.thinking_level` and `thinking_summaries`.

The levels of each model:

| Model | Levels | `budgetTokens` |
| --- | --- | --- |
| `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.1-pro-preview` | `low`, `medium`, `high` | no |
| `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.1-flash-lite-preview`, `gemini-3-flash-preview` | `minimal` to `high` | no |
| `gemini-2.5-pro` | `minimal` to `high` | yes |
| `gemini-2.5-flash`, `gemini-2.5-flash-lite` | `off`, `high` | yes |

A Gemini 2.5 budget:

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";

const stream = chat({
  adapter: geminiText("gemini-2.5-pro"),
  messages: [{ role: "user", content: "Check this proof." }],
  threadId: "thread-1",
  reasoning: { level: "high", budgetTokens: 8000 },
});
```

Image models keep their own `thinkingConfig` in `modelOptions`. See [Image model options](./gemini-advanced#image-model-options).

### Models

Newest first. The package exports the full lists, for example `GeminiTextModels`.

| Activity | Factory | Models |
| --- | --- | --- |
| Chat | `geminiText` | `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview`, `gemini-3-flash-preview`, `gemini-3.1-flash-lite`, `gemini-3.1-flash-lite-preview`, `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite` |
| Images (native) | `geminiImage` | `gemini-nano-banana-2.1`, `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image` |
| Images (Imagen) | `geminiImage` | `imagen-4.0-ultra-generate-001`, `imagen-4.0-generate-001`, `imagen-4.0-fast-generate-001` |
| Speech | `geminiSpeech` | `gemini-3.1-flash-tts-preview`, `gemini-2.5-flash-preview-tts`, `gemini-2.5-pro-preview-tts` |
| Music | `geminiAudio` | `lyria-3-pro-preview`, `lyria-3-clip-preview` |
| Video | `geminiVideo` | `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, `veo-3.1-lite-generate-preview`, `gemini-omni-1.1-flash` |
| Embeddings | `geminiEmbedding` | `gemini-embedding-001` |

`adapter.inputModalities` lists the input kinds of the selected model. See [Check what a model accepts](../advanced/extend-adapter#check-what-a-model-accepts).

## Advanced

These topics are on [Gemini: Advanced](./gemini-advanced):

- Configuration and a proxy or gateway.
- Stateful conversations with the Interactions API (experimental).
- Image sizes, image edits, and image options.
- Video understanding options and speech with two speakers.
- Every provider tool, with a full sample, and the API reference.
