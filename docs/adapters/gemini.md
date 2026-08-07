---
title: Google Gemini
id: gemini-adapter
order: 3
description: "Gemini text, Imagen/NanoBanana images, experimental TTS, and provider tools via @tanstack/ai-gemini."
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

If you need Gemini → install, set `GEMINI_API_KEY` or `GOOGLE_API_KEY`, call `geminiText(model)`.

Media example: [ts-react-media](https://github.com/TanStack/ai/tree/main/examples/ts-react-media).

## Install

```bash
npm install @tanstack/ai-gemini
```

```bash
GEMINI_API_KEY=your-api-key-here
# or GOOGLE_API_KEY=...
```

Key: [Google AI Studio](https://aistudio.google.com/apikey).

## Do this

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";

const stream = chat({
  adapter: geminiText("gemini-3.1-pro-preview"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Explicit API key

```typescript
import { chat } from "@tanstack/ai";
import { createGeminiChat } from "@tanstack/ai-gemini";

const adapter = createGeminiChat("gemini-3.1-pro-preview", process.env.GEMINI_API_KEY!, {
  // httpOptions.baseUrl, ...
});

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Server + tools

```typescript
import { chat, toServerSentEventsResponse, toolDefinition } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { z } from "zod";

const getCalendarEventsDef = toolDefinition({
  name: "get_calendar_events",
  description: "Get calendar events for a date",
  inputSchema: z.object({
    date: z.string(),
  }),
});

const getCalendarEvents = getCalendarEventsDef.server(async ({ date }) => {
  return { events: [] };
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: geminiText("gemini-3.1-pro-preview"),
    messages,
    tools: [getCalendarEvents],
  });

  return toServerSentEventsResponse(stream);
}
```

## Model options

Sampling in `modelOptions` (camelCase for `geminiText`):

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";

const stream = chat({
  adapter: geminiText("gemini-3.1-pro-preview"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    maxOutputTokens: 2048,
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    stopSequences: ["END"],
  },
});
```

> Root-level sampling migration: [modelOptions](../migration/sampling-options-to-model-options).

```typescript ignore
modelOptions: {
  thinking: { includeThoughts: true },
  // or
  responseMimeType: "application/json",
}
```

## Interactions API (experimental)

Stateful conversations via `previous_interaction_id`. Export: `@tanstack/ai-gemini/experimental`. Google Beta — may break.

**Must:** multi-turn needs `previous_interaction_id` + `store: true`. Fresh interaction with multi-message history throws. Re-pass tools / `system_instruction` / `generation_config` every turn (not inherited). Capture id from CUSTOM `gemini.interactionId`.

```typescript ignore
import { chat } from "@tanstack/ai";
import { geminiTextInteractions } from "@tanstack/ai-gemini/experimental";

let interactionId: string | undefined;

for await (const chunk of chat({
  adapter: geminiTextInteractions("gemini-3.5-flash"),
  messages: [{ role: "user", content: "Hi, my name is Amir." }],
})) {
  if (
    chunk.type === "CUSTOM" &&
    chunk.name === "gemini.interactionId" &&
    chunk.value &&
    typeof chunk.value === "object" &&
    "interactionId" in chunk.value
  ) {
    interactionId = String(chunk.value.interactionId);
  }
}

for await (const chunk of chat({
  adapter: geminiTextInteractions("gemini-3.5-flash"),
  messages: [{ role: "user", content: "What is my name?" }],
  modelOptions: {
    previous_interaction_id: interactionId,
  },
})) {
  // stream reply
}
```

### useChat wiring

**Server:**

```typescript
import {
  chat,
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { geminiTextInteractions } from "@tanstack/ai-gemini/experimental";

export async function POST({ request }: { request: Request }) {
  const params = await chatParamsFromRequestBody(await request.json());

  const previousInteractionId =
    typeof params.forwardedProps.previousInteractionId === "string"
      ? params.forwardedProps.previousInteractionId
      : undefined;

  const stream = chat({
    adapter: geminiTextInteractions("gemini-3.5-flash"),
    messages: params.messages,
    modelOptions: {
      previous_interaction_id: previousInteractionId,
      store: true,
    },
  });

  return toServerSentEventsResponse(stream);
}
```

**Client:**

```tsx
import { useEffect, useMemo, useState } from "react";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";

function GeminiChat() {
  const [interactionId, setInteractionId] = useState<string | undefined>();

  const body = useMemo(
    () => (interactionId ? { previousInteractionId: interactionId } : {}),
    [interactionId],
  );

  const { messages, setMessages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    body,
    onCustomEvent: (eventType, data) => {
      if (
        eventType === "gemini.interactionId" &&
        typeof data === "object" &&
        data !== null &&
        "interactionId" in data
      ) {
        setInteractionId(String(data.interactionId));
      }
    },
  });

  const [provider, setProvider] = useState("gemini-interactions");
  useEffect(() => {
    setInteractionId(undefined);
    setMessages([]);
  }, [provider]);

  // render + sendMessage
}
```

Full example: [`examples/ts-react-chat`](https://github.com/TanStack/ai/tree/main/examples/ts-react-chat).

| | `geminiText` | `geminiTextInteractions` |
| --- | --- | --- |
| Endpoint | `generateContent` | `interactions:create` |
| State | Full history each turn | Server via `previous_interaction_id` |
| Options shape | camelCase | snake_case |
| Stability | GA | Experimental |

```typescript
import { chat } from "@tanstack/ai";
import { geminiTextInteractions } from "@tanstack/ai-gemini/experimental";

const stream = chat({
  adapter: geminiTextInteractions("gemini-3.5-flash"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    previous_interaction_id: "int_abc123",
    store: true,
    system_instruction: "You are a helpful assistant.",
    generation_config: {
      thinking_level: "low",
      thinking_summaries: "auto",
      stop_sequences: ["<done>"],
    },
    response_modalities: ["text"],
  },
});
```

**Notes:** Retention ~55 days paid / 1 day free. `google_search_retrieval`, `google_maps`, `mcp_server` throw here — use `geminiText()`. Text-only for now.

## Summarization

```typescript
import { summarize } from "@tanstack/ai";
import { geminiSummarize } from "@tanstack/ai-gemini";

const result = await summarize({
  adapter: geminiSummarize("gemini-3.1-pro-preview"),
  text: "Your long text to summarize...",
  maxLength: 100,
  style: "concise",
});

console.log(result.summary);
```

## Image generation

Routes by model: `gemini-*` → `generateContent` (NanoBanana); `imagen-*` → `generateImages`.

### NanoBanana

```typescript
import { generateImage } from "@tanstack/ai";
import { geminiImage } from "@tanstack/ai-gemini";

const result = await generateImage({
  adapter: geminiImage("gemini-3.1-flash-image-preview"),
  prompt: "A futuristic cityscape at sunset",
  numberOfImages: 1,
  size: "16:9_4K",
});

console.log(result.images);
```

Size: `"aspectRatio_resolution"` — ratios `1:1`–`21:9`; res `1K`/`2K`/`4K`.

### Imagen

```typescript
import { generateImage } from "@tanstack/ai";
import { geminiImage } from "@tanstack/ai-gemini";

const result = await generateImage({
  adapter: geminiImage("imagen-4.0-generate-001"),
  prompt: "A futuristic cityscape at sunset",
  numberOfImages: 1,
  modelOptions: {
    aspectRatio: "16:9",
  },
});
```

Person/safety filters use SDK enums (not plain strings):

```typescript ignore
import { generateImage } from "@tanstack/ai";
import { geminiImage } from "@tanstack/ai-gemini";

const result = await generateImage({
  adapter: geminiImage("imagen-4.0-generate-001"),
  prompt: "...",
  modelOptions: {
    aspectRatio: "16:9",
    personGeneration: "DONT_ALLOW", // PersonGeneration enum
    safetyFilterLevel: "BLOCK_SOME", // SafetyFilterLevel enum
  },
});
```

Sizes: `1024x1024` (1:1), `1920x1080` (16:9), `1080x1920` (9:16).

### Models

| Gemini native | Imagen |
| --- | --- |
| `gemini-3.1-flash-image-preview` | `imagen-4.0-ultra-generate-001` |
| `gemini-3.1-flash-lite-image` | `imagen-4.0-generate-001` |
| `gemini-3-pro-image-preview` | `imagen-4.0-fast-generate-001` |
| `gemini-2.5-flash-image` | |

## Text-to-speech (experimental)

```typescript
import { generateSpeech } from "@tanstack/ai";
import { geminiSpeech } from "@tanstack/ai-gemini";

const result = await generateSpeech({
  adapter: geminiSpeech("gemini-3.1-flash-tts-preview"),
  text: "Hello from Gemini TTS!",
});

console.log(result.audio);
```

## API reference

Short factories use env key; `create*` takes explicit key.

| Factory | Purpose |
| --- | --- |
| `geminiText` / `createGeminiChat` | Chat |
| `geminiTextInteractions` / `createGeminiTextInteractions` | Interactions (experimental) |
| `geminiSummarize` / `createGeminiSummarize` | Summarize |
| `geminiImage` / `createGeminiImage` | Image |
| `geminiSpeech` / `createGeminiSpeech` | TTS (experimental) |
| `geminiAudio` / `createGeminiAudio` | Lyria music (experimental) |

## Provider tools

From `@tanstack/ai-gemini/tools`. Matrix: [Provider Tools](../tools/provider-tools.md).

### `codeExecutionTool`

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { codeExecutionTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-3.1-pro-preview"),
  messages: [{ role: "user", content: "Calculate the first 10 Fibonacci numbers" }],
  tools: [codeExecutionTool()],
});
```

### `fileSearchTool`

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { fileSearchTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-3.1-pro-preview"),
  messages: [{ role: "user", content: "Find the quarterly revenue figures" }],
  tools: [
    fileSearchTool({
      fileSearchStoreNames: ["fileSearchStores/my-file-search-store-123"],
    }),
  ],
});
```

### `googleSearchTool`

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { googleSearchTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-3.1-pro-preview"),
  messages: [{ role: "user", content: "What's the weather in Tokyo right now?" }],
  tools: [googleSearchTool()],
});
```

### `googleSearchRetrievalTool`

```typescript ignore
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { googleSearchRetrievalTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-3.1-pro-preview"),
  messages: [{ role: "user", content: "Explain the latest JavaScript proposals" }],
  tools: [
    googleSearchRetrievalTool({
      dynamicRetrievalConfig: { mode: "MODE_DYNAMIC", dynamicThreshold: 0.7 },
    }),
  ],
});
```

### `googleMapsTool`

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { googleMapsTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-2.5-pro"),
  messages: [{ role: "user", content: "Find coffee shops near Union Square, SF" }],
  tools: [googleMapsTool()],
});
```

### `urlContextTool`

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { urlContextTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-3.1-pro-preview"),
  messages: [{ role: "user", content: "Summarise https://example.com/article" }],
  tools: [urlContextTool()],
});
```

### `computerUseTool`

```typescript ignore
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { computerUseTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-3.1-pro-preview"),
  messages: [{ role: "user", content: "Navigate to example.com in the browser" }],
  tools: [
    computerUseTool({
      environment: "browser",
    }),
  ],
});
```

## Next steps

- [Image Generation](../media/image-generation)
- [Media example](https://github.com/TanStack/ai/tree/main/examples/ts-react-media)
- [Getting Started](../getting-started/quick-start)
- [Tools](../tools/tools)
- [Other Adapters](./openai)
