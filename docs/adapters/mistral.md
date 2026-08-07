---
title: Mistral
id: mistral-adapter
order: 7
description: "Mistral chat, vision (Pixtral), reasoning (Magistral), and Codestral via @tanstack/ai-mistral."
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

If you need Mistral → install, set `MISTRAL_API_KEY`, call `mistralText(model)`.

## Install

```bash
npm install @tanstack/ai-mistral
```

```bash
MISTRAL_API_KEY=...
```

Key: [Mistral Console](https://console.mistral.ai/).

## Do this

```typescript
import { chat } from "@tanstack/ai";
import { mistralText } from "@tanstack/ai-mistral";

const stream = chat({
  adapter: mistralText("mistral-large-latest"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Explicit API key

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

### Config

```typescript
import {
  createMistralText,
  type MistralTextConfig,
} from "@tanstack/ai-mistral";

const config: Omit<MistralTextConfig, "apiKey"> = {
  serverURL: "https://api.mistral.ai",
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

### Server + tools

```typescript
import { chat, toServerSentEventsResponse, toolDefinition } from "@tanstack/ai";
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

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: mistralText("mistral-large-latest"),
    messages,
    tools: [getWeather],
  });

  return toServerSentEventsResponse(stream);
}
```

## Vision

Models: `pixtral-large-latest`, `pixtral-12b-2409`, `mistral-medium-latest`, `mistral-small-latest`.

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

Base64: `source.type: "data"` + `mimeType`. See [Multimodal Content](../advanced/multimodal-content).

## Reasoning (Magistral)

`magistral-medium-latest`, `magistral-small-latest` — `REASONING_*` before `TEXT_MESSAGE_*`. Spec: [Thinking & Reasoning](../chat/thinking-content).

```typescript ignore
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

## Structured output

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
  outputSchema: recipeSchema,
});

console.log(recipe.name);
```

See [Structured Outputs](../chat/structured-outputs).

## Model options

Snake_case Mistral names in `modelOptions`:

```typescript
import { chat } from "@tanstack/ai";
import { mistralText } from "@tanstack/ai-mistral";

const stream = chat({
  adapter: mistralText("mistral-large-latest"),
  messages: [{ role: "user", content: "Hello!" }],
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

## Models

| Group | IDs |
| --- | --- |
| Chat | `mistral-large-latest`, `mistral-medium-latest`, `mistral-small-latest`, `ministral-8b-latest`, `ministral-3b-latest`, `open-mistral-nemo` |
| Code | `codestral-latest` |
| Vision | `pixtral-large-latest`, `pixtral-12b-2409` |
| Reasoning | `magistral-medium-latest`, `magistral-small-latest` |

Compare: [Mistral docs](https://docs.mistral.ai/getting-started/models/compare).

## API reference

| Factory | Purpose |
| --- | --- |
| `mistralText(model, config?)` | Env key; `serverURL?`, `defaultHeaders?` |
| `createMistralText(model, apiKey, config?)` | Explicit key |

## Notes

- No embeddings adapter — use [Mistral SDK](https://github.com/mistralai/client-ts) for `mistral-embed`
- No image/audio/video generation, TTS, or STT

No provider-tool factories — use `toolDefinition()` ([tools](../tools/tools.md)).

## Next steps

- [Getting Started](../getting-started/quick-start)
- [Tools](../tools/tools)
- [Structured Outputs](../chat/structured-outputs)
- [Multimodal Content](../advanced/multimodal-content)
- [Other Adapters](./openai)
