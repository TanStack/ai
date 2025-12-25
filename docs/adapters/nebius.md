---
title: Nebius Token Factory
id: nebius-adapter
order: 5
---

The Nebius Token Factory adapter provides access to various LLMs hosted on Nebius Token Factory, including DeepSeek, Llama, Qwen, and more. Nebius Token Factory offers an OpenAI-compatible API, making it easy to use these models with TanStack AI.

## Installation

```bash
npm install @tanstack/ai-nebius
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { nebiusText } from "@tanstack/ai-nebius";

const stream = chat({
  adapter: nebiusText("deepseek-ai/DeepSeek-R1-0528"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Basic Usage - Custom API Key

```typescript
import { chat } from "@tanstack/ai";
import { createNebiusChat } from "@tanstack/ai-nebius";

const adapter = createNebiusChat(
  "deepseek-ai/DeepSeek-R1-0528",
  "your-api-key-here"
);

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Configuration

```typescript
import { createNebiusChat } from "@tanstack/ai-nebius";

// With explicit API key
const adapter = createNebiusChat("deepseek-ai/DeepSeek-R1-0528", "your-api-key");

// With custom base URL (optional, defaults to Nebius endpoint)
const adapter = createNebiusChat(
  "deepseek-ai/DeepSeek-R1-0528",
  "your-api-key",
  { baseURL: "https://api.tokenfactory.nebius.com/v1/" }
);
```

## Available Models

Nebius Token Factory offers a variety of models. You can use any model name as a string, but here are some popular options:

### DeepSeek Models
- `deepseek-ai/DeepSeek-R1-0528` - DeepSeek R1 reasoning model
- `deepseek-ai/DeepSeek-V3-0324` - DeepSeek V3 model

### Llama Models
- `meta-llama/Meta-Llama-3.1-70B-Instruct` - Llama 3.1 70B
- `meta-llama/Meta-Llama-3.1-8B-Instruct` - Llama 3.1 8B
- `meta-llama/Meta-Llama-3.1-405B-Instruct` - Llama 3.1 405B

### Qwen Models
- `Qwen/Qwen2.5-72B-Instruct` - Qwen 2.5 72B
- `Qwen/Qwen2.5-7B-Instruct` - Qwen 2.5 7B
- `Qwen/Qwen2.5-32B-Instruct` - Qwen 2.5 32B

To see all available models, check the [Nebius Token Factory documentation](https://docs.tokenfactory.nebius.com/ai-models-inference/overview).

## Example: Chat Completion

```typescript
import { chat, toStreamResponse } from "@tanstack/ai";
import { nebiusText } from "@tanstack/ai-nebius";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: nebiusText("deepseek-ai/DeepSeek-R1-0528"),
    messages,
  });

  return toStreamResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { nebiusText } from "@tanstack/ai-nebius";
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

const stream = chat({
  adapter: nebiusText("deepseek-ai/DeepSeek-R1-0528"),
  messages,
  tools: [getWeather],
});
```

**Note:** Tool support varies by model. Models like DeepSeek R1, Llama 3.1, and Qwen 2.5 generally have good tool calling support.

## Model Options

Nebius supports various provider-specific options compatible with OpenAI's chat completions API:

```typescript
const stream = chat({
  adapter: nebiusText("deepseek-ai/DeepSeek-R1-0528"),
  messages,
  modelOptions: {
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 1000,
    presence_penalty: 0.5,
    frequency_penalty: 0.5,
    stop: ["END"],
  },
});
```

### Available Options

```typescript
modelOptions: {
  // Sampling
  temperature: 0.7,        // 0-2, controls randomness
  top_p: 0.9,              // 0-1, nucleus sampling
  
  // Generation
  max_tokens: 1000,        // Maximum tokens to generate
  stop: ["END"],           // Stop sequences (string or array)
  
  // Penalties
  presence_penalty: 0.5,   // -2.0 to 2.0
  frequency_penalty: 0.5,  // -2.0 to 2.0
  
  // Advanced
  logit_bias: {},          // Logit bias map
  user: "user-123",        // User identifier
}
```

## Summarization

Summarize long text content:

```typescript
import { summarize } from "@tanstack/ai";
import { nebiusSummarize } from "@tanstack/ai-nebius";

const result = await summarize({
  adapter: nebiusSummarize("deepseek-ai/DeepSeek-R1-0528"),
  text: "Your long text to summarize...",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});

console.log(result.summary);
```

## Getting Started with Nebius Token Factory

### 1. Create an Account

Visit [Nebius Token Factory](https://tokenfactory.nebius.com) and sign up using your Google or GitHub account.

### 2. Get an API Key

- Navigate to the **API keys** section in your dashboard
- Click on **Create API key**
- Provide a name for the key
- Save the generated API key securely

### 3. Set Environment Variable

```bash
NEBIUS_API_KEY=your-api-key-here
```

## Environment Variables

Optionally set the API key in environment variables:

```bash
NEBIUS_API_KEY=your-api-key-here
```

The adapter will automatically detect `NEBIUS_API_KEY` from:
- `process.env` (Node.js)
- `window.env` (Browser with injected env)

## API Reference

### `nebiusText(model, config?)`

Creates a Nebius text/chat adapter using environment variables.

**Parameters:**
- `model` - The model name (e.g., 'deepseek-ai/DeepSeek-R1-0528')
- `config.apiKey?` - Optional API key (if not provided, uses NEBIUS_API_KEY env var)
- `config.baseURL?` - Optional base URL (defaults to Nebius endpoint)

**Returns:** A Nebius text adapter instance.

### `createNebiusChat(model, apiKey, config?)`

Creates a Nebius text/chat adapter with an explicit API key.

**Parameters:**
- `model` - The model name
- `apiKey` - Your Nebius API key
- `config.baseURL?` - Optional base URL

**Returns:** A Nebius text adapter instance.

### `nebiusSummarize(model, config?)`

Creates a Nebius summarization adapter using environment variables.

**Returns:** A Nebius summarize adapter instance.

### `createNebiusSummarize(model, apiKey, config?)`

Creates a Nebius summarization adapter with an explicit API key.

**Returns:** A Nebius summarize adapter instance.

## Benefits of Nebius Token Factory

- ✅ **Multiple Models** - Access to DeepSeek, Llama, Qwen, and more
- ✅ **OpenAI-Compatible** - Familiar API interface
- ✅ **Cost-Effective** - Competitive pricing for inference
- ✅ **Scalable** - Enterprise-grade infrastructure
- ✅ **Easy Integration** - Drop-in replacement for OpenAI-compatible workflows

## Limitations

- **Image Generation**: Nebius Token Factory does not support image generation. Use OpenAI or Gemini for image generation.
- **Model Availability**: Available models may vary. Check the [Nebius documentation](https://docs.tokenfactory.nebius.com/ai-models-inference/overview) for current offerings.

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Other Adapters](./openai) - Explore other providers

