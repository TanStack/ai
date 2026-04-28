---
title: Mistral
id: mistral-adapter
order: 7
description: "Use Mistral models with TanStack AI — Mistral Large, Mistral Medium, Pixtral vision models, Magistral reasoning models, and Codestral via @tanstack/ai-mistral."
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

The Mistral adapter provides access to Mistral's chat models, including Mistral Large, the multimodal Pixtral family, the Magistral reasoning models, and the Codestral code-specialized model.

## Installation

```bash
npm install @tanstack/ai-mistral
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { mistralText } from "@tanstack/ai-mistral";

const stream = chat({
  adapter: mistralText("mistral-large-latest"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Basic Usage - Custom API Key

```typescript
import { chat } from "@tanstack/ai";
import { createMistralText } from "@tanstack/ai-mistral";

const adapter = createMistralText(
  "mistral-large-latest",
  process.env.MISTRAL_API_KEY!,
);

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Configuration

```typescript
import {
  createMistralText,
  type MistralTextConfig,
} from "@tanstack/ai-mistral";

const config: Omit<MistralTextConfig, "apiKey"> = {
  serverURL: "https://api.mistral.ai", // Optional, this is the default
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

## Example: Chat Completion

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { mistralText } from "@tanstack/ai-mistral";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: mistralText("mistral-large-latest"),
    messages,
  });

  return toServerSentEventsResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { mistralText } from "@tanstack/ai-mistral";
import { z } from "zod";

const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get the current weather for a location",
  inputSchema: z.object({
    location: z.string(),
  }),
});

const getWeather = getWeatherDef.server(async ({ location }) => {
  return { temperature: 72, conditions: "sunny" };
});

const stream = chat({
  adapter: mistralText("mistral-large-latest"),
  messages: [{ role: "user", content: "What's the weather in Paris?" }],
  tools: [getWeather],
});
```

## Example: Multimodal (Vision)

Use a vision-capable model — `pixtral-large-latest`, `pixtral-12b-2409`, `mistral-medium-latest`, or `mistral-small-latest` — to send images alongside text:

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
});
```

For data-URL or base64 images, set `source.type` to `"data"` and provide `mimeType`:

```typescript
{
  type: "image",
  source: {
    type: "data",
    mimeType: "image/png",
    value: base64String,
  },
}
```

See [Multimodal Content](../advanced/multimodal-content) for the full content-part shape.

## Example: Reasoning (Magistral)

Magistral models (`magistral-medium-latest`, `magistral-small-latest`) stream their reasoning as separate events before the final answer. The adapter emits AG-UI `REASONING_*` chunks for the thinking content and `TEXT_MESSAGE_*` chunks for the answer:

```typescript
import { chat } from "@tanstack/ai";
import { mistralText } from "@tanstack/ai-mistral";

const stream = chat({
  adapter: mistralText("magistral-medium-latest"),
  messages: [{ role: "user", content: "Why is the sky blue?" }],
});

for await (const chunk of stream) {
  if (chunk.type === "REASONING_MESSAGE_CONTENT") {
    process.stdout.write(`[thinking] ${chunk.delta}`);
  } else if (chunk.type === "TEXT_MESSAGE_CONTENT") {
    process.stdout.write(chunk.delta);
  }
}
```

Reasoning events are always closed before any text or tool output begins, so consumers see a complete `REASONING_START → REASONING_MESSAGE_START → REASONING_MESSAGE_CONTENT* → REASONING_MESSAGE_END → REASONING_END` sequence first.

See [Thinking & Reasoning](../chat/thinking-content) for the cross-provider event spec.

## Example: Structured Output

Generate JSON that conforms to a Zod schema using Mistral's `json_schema` response format:

```typescript
import { generate } from "@tanstack/ai";
import { mistralText } from "@tanstack/ai-mistral";
import { z } from "zod";

const recipeSchema = z.object({
  name: z.string(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
});

const result = await generate({
  adapter: mistralText("mistral-large-latest"),
  messages: [
    { role: "user", content: "Give me a chocolate chip cookie recipe." },
  ],
  outputSchema: recipeSchema,
});

console.log(result.data); // typed as z.infer<typeof recipeSchema>
```

See [Structured Outputs](../chat/structured-outputs) for the full guide.

## Model Options

Mistral exposes provider-specific options via `modelOptions`:

```typescript
const stream = chat({
  adapter: mistralText("mistral-large-latest"),
  messages,
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 1024,
  modelOptions: {
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

> Pass `temperature`, `topP`, and `maxTokens` at the top level — not inside `modelOptions`.

## Environment Variables

Set your API key in environment variables:

```bash
MISTRAL_API_KEY=...
```

Get a key from the [Mistral Console](https://console.mistral.ai/).

## Supported Models

### Chat

- `mistral-large-latest` — Flagship general-purpose model (128k context)
- `mistral-medium-latest` — Multimodal mid-tier model with vision
- `mistral-small-latest` — Fast, affordable multimodal model with vision
- `ministral-8b-latest` — 8B edge model
- `ministral-3b-latest` — 3B edge model
- `open-mistral-nemo` — Open 12B model

### Code

- `codestral-latest` — Code-specialized model (256k context)

### Vision

- `pixtral-large-latest` — Large vision model
- `pixtral-12b-2409` — 12B vision model

### Reasoning

Reasoning content is streamed as `REASONING_*` events before the final answer.

- `magistral-medium-latest` — Mid-tier reasoning model
- `magistral-small-latest` — Small reasoning model

See [Mistral's model comparison](https://docs.mistral.ai/getting-started/models/compare) for full details.

## API Reference

### `mistralText(model, config?)`

Creates a Mistral text adapter using the `MISTRAL_API_KEY` environment variable.

**Parameters:**

- `model` — The model name (e.g., `'mistral-large-latest'`)
- `config.serverURL?` — Custom base URL (optional)
- `config.defaultHeaders?` — Headers to attach to every request (optional)

**Returns:** A Mistral text adapter instance.

### `createMistralText(model, apiKey, config?)`

Creates a Mistral text adapter with an explicit API key.

**Parameters:**

- `model` — The model name
- `apiKey` — Your Mistral API key
- `config.serverURL?` — Custom base URL (optional)
- `config.defaultHeaders?` — Headers to attach to every request (optional)

**Returns:** A Mistral text adapter instance.

## Limitations

- **Embeddings**: Use the [Mistral SDK](https://github.com/mistralai/client-ts) directly for `mistral-embed`.
- **Image / Audio / Video Generation**: Mistral does not provide these endpoints. Use OpenAI, Gemini, or fal.ai.
- **Text-to-Speech / Transcription**: Not supported. Use OpenAI or ElevenLabs.

## Next Steps

- [Getting Started](../getting-started/quick-start) — Learn the basics
- [Tools Guide](../tools/tools) — Define and call tools
- [Structured Outputs](../chat/structured-outputs) — Generate typed JSON
- [Multimodal Content](../advanced/multimodal-content) — Send images and other modalities
- [Other Adapters](./openai) — Explore other providers

## Provider Tools

Mistral does not currently expose provider-specific tool factories.
Define your own tools with `toolDefinition()` from `@tanstack/ai`.

See [Tools](../tools/tools.md) for the general tool-definition flow, or
[Provider Tools](../tools/provider-tools.md) for other providers'
native-tool offerings.
