---
title: "Google Gemini: Advanced"
id: gemini-advanced
order: 3
description: "Advanced Gemini setup in TanStack AI: proxies, the experimental Interactions API, image sizes and edits, video understanding options, two-voice speech, every provider tool, and the API reference."
keywords:
  - tanstack ai
  - gemini
  - interactions api
  - nano banana
  - imagen
  - provider tools
  - adapter
---

This page has the details of the Gemini adapter. To get a first chat working, start at [Google Gemini](./gemini).

## Configuration

```typescript
import { createGeminiChat, type GeminiTextConfig } from "@tanstack/ai-gemini";

const config: Omit<GeminiTextConfig, "apiKey"> = {
  baseURL: "https://generativelanguage.googleapis.com/v1beta", // Optional
  defaultHeaders: { "X-Custom-Header": "value" }, // Optional
};

const adapter = createGeminiChat("gemini-3.8-flash", process.env.GEMINI_API_KEY!, config);
```

## Behind a proxy

Send every request through a gateway, such as Cloudflare AI Gateway or a corporate proxy, with `baseURL` and `defaultHeaders`. These two option names are the same on every TanStack AI adapter, so one gateway config works for all of them.

```typescript
import { createGeminiChat } from "@tanstack/ai-gemini";

const adapter = createGeminiChat("gemini-3.8-flash", process.env.GEMINI_API_KEY!, {
  baseURL: "https://gateway.example.com/google-ai-studio",
  defaultHeaders: { "cf-aig-authorization": `Bearer ${process.env.GATEWAY_TOKEN}` },
});
```

- `baseURL` sets `httpOptions.baseUrl`, and `defaultHeaders` sets `httpOptions.headers`. If you set both forms, `baseURL` and `defaultHeaders` win.
- This adapter ignores [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call), because the `@google/genai` SDK does not take a custom fetch.

## Video understanding options

By default, Gemini samples the video at 1 frame per second. Change the sampling in the part metadata:

```typescript ignore
// Watch a 30s-90s clip at half a frame per second.
geminiVideoPart(file, { fps: 0.5, startOffset: "30s", endOffset: "90s" });
```

### Agentic understanding

Sampling one time can miss detail in long or fast videos. Set `processing: "agentic"` to let the model drive. It moves through the timeline and gets frames, transcripts, and audio when it needs them.

```typescript ignore
geminiVideoPart(file, { processing: "agentic" });
```

Supported models:

- `gemini-3.8-flash`
- `gemini-3.7-flash`
- `gemini-3.6-flash`
- `gemini-3.5-flash-lite`

With `agentic`, the adapter sends the request through the Interactions API of Gemini. You give the sampling rate in your prompt ("watch it at 2 fps"), not with `fps`. The result is deeper but slower, because the model looks at the video again on each turn.

## Stateful conversations: Interactions API (experimental)

The [Interactions API](https://ai.google.dev/gemini-api/docs/interactions) of Gemini keeps the conversation on the server. It is the Gemini equivalent of the OpenAI Responses API, and it is in Beta. You pass a `previous_interaction_id`, and the server keeps the transcript, so you do not send the full history on every turn. This also gets more cache hits for repeated starts of a prompt.

The `geminiTextInteractions` adapter calls `client.interactions.create`. Right before `RUN_FINISHED`, it sends the interaction id from the server as an AG-UI `CUSTOM` event (`name: 'gemini.interactionId'`), so you can chain turns.

> [!WARNING]
> The Interactions API is experimental. Google marks it as Beta and can make breaking changes until it is generally available. Import the adapter from `@tanstack/ai-gemini/experimental`.

What the adapter supports:

- Text output and function tools.
- The built-in tools `google_search`, `code_execution`, `url_context`, `file_search`, and `computer_use`.
- `google_search_retrieval`, `google_maps`, and `mcp_server` throw on this adapter. Use `geminiText()` for the first two.

### Basic usage

```typescript ignore
import { chat } from "@tanstack/ai";
import { geminiTextInteractions } from "@tanstack/ai-gemini/experimental";

// Turn 1: introduce yourself, capture the interaction id.
let interactionId: string | undefined;

for await (const chunk of chat({
  adapter: geminiTextInteractions("gemini-3.5-flash"),
  messages: [{ role: "user", content: "Hi, my name is Amir." }],
  threadId: "thread-1",
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

// Turn 2: only send the new turn. The server has the history.
for await (const chunk of chat({
  adapter: geminiTextInteractions("gemini-3.5-flash"),
  messages: [{ role: "user", content: "What is my name?" }],
  threadId: "thread-1",
  modelOptions: {
    previous_interaction_id: interactionId,
  },
})) {
  // ...stream "Your name is Amir." back to the client.
}
```

### Wiring with `useChat` (React)

The Interactions API **does not accept a history of many turns without a `previous_interaction_id`**. If a chat client sends `[user, assistant, user]` to a new interaction, the adapter throws `cannot send prior conversation history on a fresh interaction`. To make `useChat` work, keep the id from the server and send it back on the next turn.

**Server route** (for example, a TanStack Start handler):

```typescript
import {
  chat,
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { geminiTextInteractions } from "@tanstack/ai-gemini/experimental";

export async function POST({ request }: { request: Request }) {
  const params = await chatParamsFromRequestBody(await request.json());

  // The client sends previousInteractionId in `forwardedProps`.
  const previousInteractionId =
    typeof params.forwardedProps.previousInteractionId === "string"
      ? params.forwardedProps.previousInteractionId
      : undefined;

  const stream = chat({
    adapter: geminiTextInteractions("gemini-3.5-flash"),
    messages: params.messages,
    threadId: params.threadId,
    modelOptions: {
      previous_interaction_id: previousInteractionId,
      store: true, // required for chaining on the next turn
    },
  });

  return toServerSentEventsResponse(stream);
}
```

**React client**:

```tsx
import { useEffect, useMemo, useState } from "react";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";

function GeminiChat() {
  const [interactionId, setInteractionId] = useState<string | undefined>();

  const forwardedProps = useMemo(
    () => (interactionId ? { previousInteractionId: interactionId } : {}),
    [interactionId],
  );

  const { messages, setMessages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
    forwardedProps,
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

  // A new provider or model starts a new chain on the server. Clear the id
  // AND the local messages together. If you do not, the next turn sends
  // many messages with no previous_interaction_id, and the adapter throws.
  const [provider, setProvider] = useState("gemini-interactions");
  useEffect(() => {
    setInteractionId(undefined);
    setMessages([]);
  }, [provider]);

  // ...render messages, call sendMessage(input)
}
```

The full example is in [`examples/ts-react-chat`](https://github.com/TanStack/ai/tree/main/examples/ts-react-chat). See `src/routes/index.tsx` for the client and `src/routes/api.tanchat.ts` for the route.

### How it differs from `geminiText`

| | `geminiText` | `geminiTextInteractions` |
| --- | --- | --- |
| Endpoint | `models:generateContent` | `interactions:create` |
| Conversation state | Stateless: send the full history each turn | Stateful: the server keeps the transcript through `previous_interaction_id` |
| Provider options | camelCase (`stopSequences`, `responseModalities`, `safetySettings`) | snake_case (`generation_config`, `response_modalities`, `previous_interaction_id`) |
| Built-in tools | `google_search`, `code_execution`, `url_context`, `file_search`, `google_maps`, `google_search_retrieval`, `computer_use` | `google_search`, `code_execution`, `url_context`, `file_search`, `computer_use`. Only the first four stream `CUSTOM` activity events |
| Stability | GA | Experimental (Google Beta) |

### Provider options

The adapter has options for the Interactions API on `modelOptions`:

```typescript
import { chat } from "@tanstack/ai";
import { geminiTextInteractions } from "@tanstack/ai-gemini/experimental";

const stream = chat({
  adapter: geminiTextInteractions("gemini-3.5-flash"),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
  // Goes out as generation_config.thinking_level and thinking_summaries.
  reasoning: "low",
  modelOptions: {
    // Chain to the last turn. Pass it only on turn 2 and later.
    previous_interaction_id: "int_abc123",

    // Keep the interaction on the server (default true). Must be true for
    // previous_interaction_id to work on the next turn.
    store: true,

    // System instruction for this interaction only. Send it again each turn.
    system_instruction: "You are a helpful assistant.",

    // snake_case generation config, not the camelCase config of geminiText.
    generation_config: {
      stop_sequences: ["<done>"],
    },

    response_modalities: ["text"],
  },
});
```

### Reading the interaction id

The interaction id from the server arrives as an AG-UI `CUSTOM` event, right before `RUN_FINISHED`:

```typescript ignore
for await (const chunk of stream) {
  if (
    chunk.type === "CUSTOM" &&
    chunk.name === "gemini.interactionId" &&
    typeof chunk.value === "object" &&
    chunk.value !== null &&
    "interactionId" in chunk.value
  ) {
    const id = String(chunk.value.interactionId);
    // Keep `id` where you store the conversation pointer of each user.
    // Pass it back on the next turn as `previous_interaction_id`.
  }
}
```

### Limits

Know these before you ship:

- **A history of many turns needs `previous_interaction_id`.** The Interactions API has no stateless replay. More than one message in `messages` without a `previous_interaction_id` throws. A chat UI with a local history must keep the id from the server and chain (see [Wiring with `useChat`](#wiring-with-usechat-react)). When the provider or model changes, also clear the local messages.
- **Tools, `system_instruction`, and `generation_config` belong to one interaction.** Google does not carry them over through `previous_interaction_id`. Pass them again on every turn that needs them.
- `store: false` does not work with `previous_interaction_id` (there is no state to recall) or with `background: true`.
- Retention, at the time of writing: **55 days on the Paid Tier, 1 day on the Free Tier.** See the [Interactions API docs](https://ai.google.dev/gemini-api/docs/interactions) of Google for the current policy.

Tools and output:

- The built-in tools (`google_search`, `code_execution`, `url_context`, `file_search`, `computer_use`) go out as request tools. The four search and code tools stream their activity back as AG-UI `CUSTOM` events with the raw Interactions delta: `gemini.googleSearchCall` and `gemini.googleSearchResult`, and the matching `codeExecutionCall`/`Result`, `urlContextCall`/`Result`, and `fileSearchCall`/`Result`.
- The Interactions API sends no `CUSTOM` events for `computer_use`. Function-tool `TOOL_CALL_*` events do not change. If only built-in tools ran, `finishReason` stays `stop`.
- `google_search_retrieval`, `google_maps`, and `mcp_server` throw an error on this adapter.
- This adapter gives text only. For images and audio, use `geminiImage` and `geminiSpeech`.

## Images

`geminiImage` picks the API from the model:

- A model in `GEMINI_NATIVE_IMAGE_MODELS` uses the Interactions API. `result.id` is the interaction id.
- An Imagen model, or an unknown id, uses `generateImages`.

Import the list or `isGeminiNativeImageModel` from `@tanstack/ai-gemini`.

### Edit a Gemini native image

You have an image from a Gemini native model. You want to change that image, without a second upload of it. Pass the last `id` back, and write only the change in `prompt`:

```typescript
import { generateImage } from "@tanstack/ai";
import { geminiImage } from "@tanstack/ai-gemini";

const adapter = geminiImage("gemini-3.1-flash-image");

const first = await generateImage({
  adapter,
  prompt: "A red bicycle on a quiet street",
  threadId: "thread-1",
});

const edited = await generateImage({
  adapter,
  prompt: "Make the bicycle blue",
  threadId: "thread-1",
  modelOptions: { previous_interaction_id: first.id },
});
```

1. Generate the first image.
2. Call `generateImage` again with `previous_interaction_id` set to `first.id`.
3. Read `edited.images` for the new picture. `edited.id` is the id for the next edit.

Keep the interaction, so that the next edit can run:

- Leave `store` unset. The API default for `store` is `true`.
- If you set `store` to `false`, a later call cannot use that id.
- A free tier keeps a stored interaction for 1 day. A paid tier keeps it for 55 days.

Also:

- If the model is Imagen, do not pass `previous_interaction_id`. The call throws.
- If this edit needs a new reference image, add that image part on this call. Do not send the image from `first`.
- The Interactions API is in Beta.

The same steps are in [Image Generation](../media/image-generation#edit-a-gemini-native-image).

### Imagen

```typescript
import { generateImage } from "@tanstack/ai";
import { geminiImage } from "@tanstack/ai-gemini";

const result = await generateImage({
  adapter: geminiImage("imagen-4.0-generate-001"),
  prompt: "A futuristic cityscape at sunset",
  threadId: "thread-1",
  numberOfImages: 1,
});

console.log(result.images);
```

### Image sizes

#### Gemini native models (Nano Banana)

The size of a native model joins an aspect ratio and a resolution tier:

```typescript ignore
// Format: "aspectRatio_resolution"
size: "16:9_4K"
size: "1:1_2K"
size: "9:16_1K"
```

Each model has its own set. TypeScript narrows `size` to the set of the model:

| Model | Aspect ratios | Resolutions |
|-------|---------------|-------------|
| `gemini-3.1-flash-image` | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`, `1:4`, `4:1`, `1:8`, `8:1` | `512`, `1K`, `2K`, `4K` |
| `gemini-3.1-flash-lite-image` | the same 14 as above (see the note) | `1K` only |
| `gemini-nano-banana-2.1` | the same 14 as above | `1K`, `2K`, `4K` |
| `gemini-3-pro-image` | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` | `1K`, `2K`, `4K` |

- The `K` is case-sensitive. The API rejects `1k`.
- The smallest tier is `512`, not `512px` or `0.5K`.
- `9:21` is for Vertex and Cloud only, so this adapter does not accept it.

> [!NOTE]
> For `gemini-3.1-flash-lite-image`, the four banner ratios (`1:4`, `4:1`, `1:8`, `8:1`) are partly inferred. The Gemini API guide has no ratio table for this model. The set of 14 comes from the Cloud model page and from the statement in the guide of "a discrete set of 14 aspect ratios". If the API rejects those four, use the 10 standard ratios on this model.

#### Imagen models

Imagen models take WIDTHxHEIGHT. The adapter maps the size to an aspect ratio:

| Size | Aspect ratio |
|------|-------------|
| `1024x1024` | 1:1 |
| `1920x1080` | 16:9 |
| `1080x1920` | 9:16 |

You can also set the aspect ratio in `modelOptions`:

```typescript
import { generateImage } from "@tanstack/ai";
import { geminiImage } from "@tanstack/ai-gemini";

const result = await generateImage({
  adapter: geminiImage("imagen-4.0-generate-001"),
  prompt: "A landscape photo",
  threadId: "thread-1",
  modelOptions: {
    aspectRatio: "16:9",
  },
});
```

### Image model options

The two model groups call different APIs, so `modelOptions` has a different type for each.

Imagen models (`generateImages`) take `GenerateImagesConfig` fields:

```typescript ignore
import { generateImage } from "@tanstack/ai";
import { geminiImage } from "@tanstack/ai-gemini";

const result = await generateImage({
  adapter: geminiImage("imagen-4.0-generate-001"),
  prompt: "...",
  threadId: "thread-1",
  modelOptions: {
    aspectRatio: "16:9", // "1:1" | "3:4" | "4:3" | "9:16" | "16:9"
    personGeneration: "DONT_ALLOW", // Control person generation
    safetyFilterLevel: "BLOCK_SOME", // Safety filtering
  },
});
```

#### Gemini native models

Set native image options on `modelOptions`:

```typescript
import { generateImage } from "@tanstack/ai";
import { geminiImage, ThinkingLevel } from "@tanstack/ai-gemini";

const result = await generateImage({
  adapter: geminiImage("gemini-3.1-flash-image"),
  prompt: "A beautiful garden",
  threadId: "thread-1",
  size: "16:9_4K",
  modelOptions: {
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    // imageConfig replaces one field from size. The 16:9 ratio from size stays.
    // imageConfig accepts only aspectRatio and imageSize.
    imageConfig: { imageSize: "2K" },
  },
});
```

- `thinkingConfig.thinkingLevel` takes `ThinkingLevel.MINIMAL`, `ThinkingLevel.LOW`, `ThinkingLevel.MEDIUM`, or `ThinkingLevel.HIGH`.
- `thinkingConfig.thinkingBudget` throws.
- If `systemInstruction` contains an image, a file, or a tool call, the call throws.
- To edit, pass the last result `id` as `previous_interaction_id`. See [Edit a Gemini native image](#edit-a-gemini-native-image).

See [Image Generation](../media/image-generation) for the full list of native options.

## Speech with two speakers

Gemini names the speakers in the prompt and maps each name to a voice. Pass `turns`, and the adapter does both for you. It uses the voice name as the speaker label:

```typescript
import { generateSpeech } from "@tanstack/ai";
import { geminiSpeech } from "@tanstack/ai-gemini";

const result = await generateSpeech({
  adapter: geminiSpeech("gemini-3.1-flash-tts-preview"),
  turns: [
    { text: "Hey, how is it going?", voice: "Puck" },
    { text: "Not bad, you?", voice: "Kore" },
  ],
  threadId: "thread-1",
});
```

- Gemini accepts **two different voices** in one request. The adapter rejects a third before the call.
- Each voice must be one of the prebuilt Gemini voices (`GeminiTTSVoices`).
- Gemini reports no timings, so this adapter rejects `timestamps: true`.
- Gemini TTS is experimental. Full support can need the Live API.

## Provider tools

Gemini has tools of its own, next to the function tools that you define. Import them from `@tanstack/ai-gemini/tools` and pass them into `chat({ tools: [...] })`.

For the concept, a comparison table, and type gating, see [Provider Tools](../tools/provider-tools.md).

### `codeExecutionTool`

Gemini runs Python code in a sandbox and returns the results inline. It takes no arguments. Add it to the `tools` array.

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { codeExecutionTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-3.8-flash"),
  messages: [{ role: "user", content: "Calculate the first 10 Fibonacci numbers" }],
  threadId: "thread-1",
  tools: [codeExecutionTool()],
});
```

**Supported models:** Gemini 1.5 Pro, Gemini 2.x, Gemini 2.5 and later. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `fileSearchTool`

Searches the files that you uploaded to the Gemini File API. Pass a `FileSearch` config object with the stores to search.

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { fileSearchTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-3.8-flash"),
  messages: [{ role: "user", content: "Find the quarterly revenue figures" }],
  threadId: "thread-1",
  tools: [
    fileSearchTool({
      fileSearchStoreNames: ["fileSearchStores/my-file-search-store-123"],
    }),
  ],
});
```

**Supported models:** Gemini 2.x and later. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `googleSearchTool`

Gemini searches Google and uses the grounded results in its answer. Pass a `GoogleSearch` config, or call it with no arguments for the defaults.

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

**Supported models:** Gemini 1.5 Pro, Gemini 2.x, Gemini 2.5. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

When Google Search returns grounding data:

- The assistant tool-call part has `metadata.providerExecuted: true` and the normalized `metadata.sources` array.
- The raw `groundingMetadata` of Gemini stays under `metadata.gemini`.
- The agent loop does not run this call in your app.

### `googleSearchRetrievalTool`

A Google Search variant for retrieval. It returns ranked passages from the web, with a dynamic retrieval mode that you can set. Pass a `GoogleSearchRetrieval` config.

```typescript ignore
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { googleSearchRetrievalTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-3.1-pro-preview"),
  messages: [{ role: "user", content: "Explain the latest JavaScript proposals" }],
  threadId: "thread-1",
  tools: [
    googleSearchRetrievalTool({
      dynamicRetrievalConfig: { mode: "MODE_DYNAMIC", dynamicThreshold: 0.7 },
    }),
  ],
});
```

**Supported models:** Gemini 1.5 Pro and later. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `googleMapsTool`

Connects Gemini to Google Maps for questions about places: directions, place search, and geocoding. Pass a `GoogleMaps` config, or call it with no arguments.

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { googleMapsTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-2.5-pro"),
  messages: [{ role: "user", content: "Find coffee shops near Union Square, SF" }],
  threadId: "thread-1",
  tools: [googleMapsTool()],
});
```

**Supported models:** Gemini 2.5 and later. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `urlContextTool`

Gets the content of the URLs in the conversation, so Gemini can use live web pages. It takes no arguments.

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { urlContextTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-3.8-flash"),
  messages: [{ role: "user", content: "Summarise https://example.com/article" }],
  threadId: "thread-1",
  tools: [urlContextTool()],
});
```

**Supported models:** Gemini 2.x and later. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `computerUseTool`

Gemini sees a virtual desktop through screenshots. It acts on the desktop with predefined computer-use functions. Give the `environment`. You can limit the functions with `excludedPredefinedFunctions`.

```typescript ignore
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { computerUseTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-3.1-pro-preview"),
  messages: [{ role: "user", content: "Navigate to example.com in the browser" }],
  threadId: "thread-1",
  tools: [
    computerUseTool({
      environment: "browser",
    }),
  ],
});
```

**Supported models:** Gemini 2.5 and later. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

## API reference

Each factory pair has the same shape. The short factory (`geminiText`, `geminiImage`, and the others) reads `GOOGLE_API_KEY` or `GEMINI_API_KEY` from the environment. The `create*` factory takes an explicit API key. Both take `model` as the first argument.

| Factories | Creates |
| --- | --- |
| `geminiText(model, config?)` / `createGeminiChat(model, apiKey, config?)` | Chat adapter |
| `geminiTextInteractions(model, config?)` / `createGeminiTextInteractions(model, apiKey, config?)` | Chat adapter on the Interactions API. Experimental. Import from `@tanstack/ai-gemini/experimental` |
| `geminiSummarize(model, config?)` / `createGeminiSummarize(model, apiKey, config?)` | Summarization adapter |
| `geminiImage(model, config?)` / `createGeminiImage(model, apiKey, config?)` | Image adapter. See [Images](#images) |
| `geminiSpeech(model, config?)` / `createGeminiSpeech(model, apiKey, config?)` | Text-to-speech adapter. Experimental |
| `geminiAudio(model, config?)` / `createGeminiAudio(model, apiKey, config?)` | Lyria music adapter. Experimental |
| `geminiVideo(model, config?)` / `createGeminiVideo(model, apiKey, config?)` | Video adapter. Experimental |
| `geminiEmbedding(model, config?)` / `createGeminiEmbedding(model, apiKey, config?)` | Embedding adapter |
| `geminiFiles` / `createGeminiFiles` | Files API adapter. See [Files API](../advanced/files-api) |

Chat adapter config:

- `config.baseURL`: a custom base URL. Optional.
- `config.defaultHeaders`: headers for every request. Optional.

`adapter.inputModalities` lists the input kinds of the selected model. It is `undefined` for a model that this package does not know. See [Check what a model accepts](../advanced/extend-adapter#check-what-a-model-accepts).
