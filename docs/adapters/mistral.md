---
title: Mistral
id: mistral-adapter
order: 7
description: "Use Mistral models in TanStack AI with @tanstack/ai-mistral: Mistral Large and Medium, Pixtral vision, Magistral reasoning, Codestral, and Mistral embeddings."
keywords:
  - tanstack ai
  - mistral
  - mistral large
  - pixtral
  - magistral
  - codestral
  - adapter
  - llm
---

The Mistral adapter calls Mistral Large, Pixtral, Magistral, and Codestral. It also creates embeddings.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-mistral
vue: @tanstack/ai-mistral
solid: @tanstack/ai-mistral
svelte: @tanstack/ai-mistral
preact: @tanstack/ai-mistral
angular: @tanstack/ai-mistral
vanilla: @tanstack/ai-mistral
octane: @tanstack/ai-mistral

<!-- ::end:tabs -->

## 2. Set the API key

Get a key from the [Mistral Console](https://console.mistral.ai/). Put it in the environment of your server:

```bash
MISTRAL_API_KEY=...
```

`mistralText` and `mistralEmbedding` read `MISTRAL_API_KEY`. To pass the key in code, use `createMistralText`:

```typescript
import { createMistralText } from "@tanstack/ai-mistral";

const adapter = createMistralText("mistral-large-latest", process.env.MISTRAL_API_KEY!);
```

## 3. Stream a chat from the server

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { mistralText } from "@tanstack/ai-mistral";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: mistralText("mistral-large-latest"),
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

You now have a streaming Mistral chat. [Tools](../tools/tools) work the same as with every adapter. Mistral has no provider tools of its own, so define your tools with `toolDefinition()`.

## Images in a message

Send an image with the text to a vision model: `pixtral-large-latest`, `pixtral-12b-2409`, `mistral-medium-latest`, or `mistral-small-latest`.

```typescript
import { chat } from "@tanstack/ai";
import { mistralText } from "@tanstack/ai-mistral";

const stream = chat({
  adapter: mistralText("pixtral-large-latest"),
  messages: [
    {
      role: "user",
      content: [
        { type: "text", content: "What's in this image?" },
        {
          type: "image",
          source: {
            type: "url",
            value: "https://example.com/photo.jpg",
          },
        },
      ],
    },
  ],
  threadId: "thread-1",
});
```

For base64 data, set `source.type` to `"data"` and add `mimeType`:

```typescript
import { chat } from "@tanstack/ai";
import { mistralText } from "@tanstack/ai-mistral";

const base64String = "..."; // your base64-encoded image bytes

const stream = chat({
  adapter: mistralText("pixtral-large-latest"),
  messages: [
    {
      role: "user",
      content: [
        { type: "text", content: "What's in this image?" },
        {
          type: "image",
          source: {
            type: "data",
            mimeType: "image/png",
            value: base64String,
          },
        },
      ],
    },
  ],
  threadId: "thread-1",
});
```

See [Multimodal Content](../advanced/multimodal-content) for the full shape of a content part.

## Structured output

Get JSON that matches a Zod schema. The adapter uses the `json_schema` response format of Mistral:

```typescript
import { chat } from "@tanstack/ai";
import { mistralText } from "@tanstack/ai-mistral";
import { z } from "zod";

const recipeSchema = z.object({
  name: z.string(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
});

const recipe = await chat({
  adapter: mistralText("mistral-large-latest"),
  messages: [
    { role: "user", content: "Give me a chocolate chip cookie recipe." },
  ],
  threadId: "thread-1",
  outputSchema: recipeSchema,
});

console.log(recipe.name); // typed as z.infer<typeof recipeSchema>
```

See [Structured Outputs](../chat/structured-outputs).

## Embeddings

```typescript
import { embed } from "@tanstack/ai";
import { mistralEmbedding } from "@tanstack/ai-mistral";

const result = await embed({
  adapter: mistralEmbedding("mistral-embed"),
  input: ["a red guitar", "a blue drum kit"],
});

console.log(result.embeddings[0]?.vector); // 1024 dimensions
```

`mistral-embed` always gives 1024 dimensions. `codestral-embed` is tuned for code, and it takes the top-level `dimensions` option:

```typescript
import { embed } from "@tanstack/ai";
import { mistralEmbedding } from "@tanstack/ai-mistral";

const result = await embed({
  adapter: mistralEmbedding("codestral-embed"),
  input: "function add(a, b) { return a + b }",
  dimensions: 512,
});
```

See the [Embeddings guide](../embeddings.md).

## What Mistral does not do

- Image, audio, and video generation. Use [OpenAI](./openai), [Gemini](./gemini), or [fal.ai](./fal).
- Text-to-speech and transcription. Use [OpenAI](./openai) or [ElevenLabs](./elevenlabs).

## Models and options

### Model options

Provider options go in `modelOptions`, with the snake_case names of Mistral. This includes the sampling options `temperature`, `top_p`, and `max_tokens`:

```typescript
import { chat } from "@tanstack/ai";
import { mistralText } from "@tanstack/ai-mistral";

const stream = chat({
  adapter: mistralText("mistral-large-latest"),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
  modelOptions: {
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 1024,
    random_seed: 42,
    stop: ["END"],
    safe_prompt: true,
    frequency_penalty: 0.5,
    presence_penalty: 0.5,
    parallel_tool_calls: true,
    tool_choice: "auto",
  },
});
```

Sampling options do not go at the root of `chat()`. See [Moving Sampling Options into modelOptions](../migration/sampling-options-to-model-options).

### Reasoning

Set `reasoning` on `chat()` to turn thinking up, down, or off:

```typescript
import { chat } from "@tanstack/ai";
import { mistralText } from "@tanstack/ai-mistral";

const stream = chat({
  adapter: mistralText("mistral-medium-latest"),
  messages: [{ role: "user", content: "Why is the sky blue?" }],
  threadId: "thread-1",
  reasoning: "high",
});
```

What goes to Mistral:

- `mistral-medium-latest`, `mistral-small-latest`: `reasoning_effort`. They take `off` (sent as `none`) and `high`.
- `magistral-medium-latest`, `magistral-small-latest`: they take `off` and `high`. `high` sends `prompt_mode: "reasoning"`. `off` sends nothing.

The other models take no `reasoning`. The Magistral models stream their thinking before the answer. See [Magistral thinking events](#magistral-thinking-events).

### Models

| Group | Models |
| --- | --- |
| Chat | `mistral-large-latest` (flagship, 128k context), `mistral-medium-latest` (with vision), `mistral-small-latest` (fast, with vision), `ministral-8b-latest`, `ministral-3b-latest`, `open-mistral-nemo` |
| Code | `codestral-latest` (256k context) |
| Vision | `pixtral-large-latest`, `pixtral-12b-2409` |
| Reasoning | `magistral-medium-latest`, `magistral-small-latest` |
| Embeddings | `mistral-embed`, `codestral-embed` |
| Chat on Vertex | `mistral-medium-3`, `mistral-small-2503`, `codestral-2` |

See the [model comparison](https://docs.mistral.ai/getting-started/models/compare) of Mistral for the full details. `adapter.inputModalities` lists the input kinds of the selected model. See [Check what a model accepts](../advanced/extend-adapter#check-what-a-model-accepts).

## Advanced

### Configuration

```typescript
import {
  createMistralText,
  type MistralTextConfig,
} from "@tanstack/ai-mistral";

const config: Omit<MistralTextConfig, "apiKey"> = {
  baseURL: "https://api.mistral.ai", // Optional, this is the default
  defaultHeaders: {
    "X-Custom-Header": "value",
  },
};

const adapter = createMistralText(
  "mistral-large-latest",
  process.env.MISTRAL_API_KEY!,
  config,
);
```

### Behind a proxy

Send every request through a gateway, such as Cloudflare AI Gateway or a corporate proxy, with `baseURL` and `defaultHeaders`. These two option names are the same on every TanStack AI adapter, so one gateway config works for all of them.

```typescript
import { createMistralText } from "@tanstack/ai-mistral";

const adapter = createMistralText("mistral-large-latest", process.env.MISTRAL_API_KEY!, {
  baseURL: "https://gateway.example.com/mistral",
  defaultHeaders: { "cf-aig-authorization": `Bearer ${process.env.GATEWAY_TOKEN}` },
});
```

- `serverURL` is an alias of `baseURL`. If you set both, `baseURL` wins.
- Need more than a fixed header, such as a log of each model call? This adapter supports [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call).

### Prompt caching

Mistral caches the start of your requests by itself.

- `chat()` sends `prompt_cache_key` by default. The key is the `threadId` that you pass, so one conversation shares a cache.
- The key goes only to `api.mistral.ai`, on `chat()` and on structured output.
- With `promptCache: 'none'`, no key goes out.
- Cache reads show up in `usage.promptTokensDetails.cachedTokens`.

See [Prompt Caching](../advanced/prompt-caching).

### Magistral thinking events

The Magistral models (`magistral-medium-latest`, `magistral-small-latest`) stream their thinking as separate events before the answer. The adapter sends AG-UI `REASONING_*` chunks for the thinking and `TEXT_MESSAGE_*` chunks for the answer:

```typescript ignore
// ignore: narrowing the raw AG-UI stream by `chunk.type` relies on @ag-ui/core's
// discriminated-union `type` field, which kiira can't resolve in a source-only
// check. The runtime behaviour is exactly as shown.
import { chat } from "@tanstack/ai";
import { mistralText } from "@tanstack/ai-mistral";

const stream = chat({
  adapter: mistralText("magistral-medium-latest"),
  messages: [{ role: "user", content: "Why is the sky blue?" }],
  threadId: "thread-1",
});

for await (const chunk of stream) {
  if (chunk.type === "REASONING_MESSAGE_CONTENT") {
    process.stdout.write(`[thinking] ${chunk.delta}`);
  } else if (chunk.type === "TEXT_MESSAGE_CONTENT") {
    process.stdout.write(chunk.delta);
  }
}
```

The reasoning events always close before any text or tool output starts. So you first see the full sequence: `REASONING_START`, `REASONING_MESSAGE_START`, `REASONING_MESSAGE_CONTENT` (one or more), `REASONING_MESSAGE_END`, `REASONING_END`.

See [Thinking & Reasoning](../chat/thinking-content) for the event spec of all providers.

### Mistral on Vertex

Use `@tanstack/ai-mistral/vertex` when Mistral must run on Vertex AI. That path uses Google Cloud credentials and the publisher `rawPredict` endpoint.

Mistral on Vertex is regional only. Use `us-central1` or `europe-west4`.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-mistral google-auth-library
vue: @tanstack/ai-mistral google-auth-library
solid: @tanstack/ai-mistral google-auth-library
svelte: @tanstack/ai-mistral google-auth-library
preact: @tanstack/ai-mistral google-auth-library
angular: @tanstack/ai-mistral google-auth-library
vanilla: @tanstack/ai-mistral google-auth-library
octane: @tanstack/ai-mistral google-auth-library

<!-- ::end:tabs -->

```typescript
import { chat } from "@tanstack/ai";
import { mistralVertexText } from "@tanstack/ai-mistral/vertex";

const stream = chat({
  adapter: mistralVertexText("mistral-medium-3", {
    project: "my-project",
    location: "europe-west4",
  }),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
});
```

- `project` and `location` use the same names as `@tanstack/ai-vertex`. `location` is required.
- `mistralVertexText` accepts only the Mistral chat models that Vertex lists: `mistral-medium-3`, `mistral-small-2503`, and `codestral-2`.
- Mistral API aliases such as `mistral-large-latest` and `mistral-medium-latest` are not Vertex model ids. Vertex also lists `mistral-ocr-2505`, but that model is OCR, not chat.
- Install `google-auth-library` for Application Default Credentials, or pass `authClient` or `getAccessToken`.

Gemini on Vertex is in [`@tanstack/ai-vertex`](./vertex).

### API reference

| Factory | Creates |
| --- | --- |
| `mistralText(model, config?)` | Text adapter. Reads `MISTRAL_API_KEY` |
| `createMistralText(model, apiKey, config?)` | Text adapter with an explicit API key |
| `mistralEmbedding(model, config?)` / `createMistralEmbedding(model, apiKey, config?)` | Embedding adapter |
| `mistralVertexText(model, config)` | Text adapter on Vertex. Import from `@tanstack/ai-mistral/vertex` |

- `config.baseURL`: a custom base URL. Optional. `serverURL` is an alias.
- `config.defaultHeaders`: headers for every request. Optional.

`adapter.inputModalities` lists the input kinds of the selected model. It is `undefined` for a model that this package does not know.
