---
title: AWS Bedrock
id: bedrock-adapter
order: 9
---

The AWS Bedrock adapter provides access to Amazon Bedrock's managed AI models, including Amazon Nova and Anthropic Claude models, via the unified Converse API.

## Installation

```bash
npm install @tanstack/ai-bedrock
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { bedrockText } from "@tanstack/ai-bedrock";

const stream = chat({
  adapter: bedrockText("amazon.nova-pro-v1:0"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Basic Usage - Custom Credentials

```typescript
import { chat } from "@tanstack/ai";
import { createBedrockChat } from "@tanstack/ai-bedrock";

const adapter = createBedrockChat("amazon.nova-pro-v1:0", {
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Environment Variables

The `bedrockText()` factory reads AWS credentials automatically from environment variables:

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_SESSION_TOKEN=...  # Optional, for temporary credentials
```

## Example: Chat Completion

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { bedrockText } from "@tanstack/ai-bedrock";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: bedrockText("amazon.nova-pro-v1:0"),
    messages,
  });

  return toServerSentEventsResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { bedrockText } from "@tanstack/ai-bedrock";
import { z } from "zod";

const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get current weather for a city",
  inputSchema: z.object({
    city: z.string(),
  }),
});

const getWeather = getWeatherDef.server(async ({ city }) => {
  return { temperature: 72, conditions: "sunny", city };
});

const stream = chat({
  adapter: bedrockText("anthropic.claude-sonnet-4-5-20250929-v1:0"),
  messages: [{ role: "user", content: "What's the weather in Paris?" }],
  tools: [getWeather],
});
```

## Thinking / Extended Reasoning

Models that support thinking (Claude Sonnet 4.5, Claude Haiku 4.5, and Nova models) can be configured to show their reasoning process, streamed as `thinking` chunks:

```typescript
import { chat } from "@tanstack/ai";
import { bedrockText } from "@tanstack/ai-bedrock";

const stream = chat({
  adapter: bedrockText("anthropic.claude-sonnet-4-5-20250929-v1:0"),
  messages: [{ role: "user", content: "Solve this step by step: 17 * 24" }],
  modelOptions: {
    thinking: {
      type: "enabled",
      budget_tokens: 2000,
    },
  },
});

for await (const chunk of stream) {
  if (chunk.type === "thinking") {
    process.stdout.write(`[thinking] ${chunk.delta}`);
  } else if (chunk.type === "content") {
    process.stdout.write(chunk.delta);
  }
}
```

Nova models use a `reasoningConfig` approach but produce the same `thinking` stream chunks — the adapter normalises both automatically.

## Multimodal Content

Nova Pro, Nova Lite, and Claude models support image and document inputs:

```typescript
import { chat } from "@tanstack/ai";
import { bedrockText } from "@tanstack/ai-bedrock";
import { readFileSync } from "fs";

const imageBytes = readFileSync("./photo.jpg");

const stream = chat({
  adapter: bedrockText("amazon.nova-pro-v1:0"),
  messages: [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", value: imageBytes },
          metadata: { mediaType: "image/jpeg" },
        },
        { type: "text", content: "What do you see in this image?" },
      ],
    },
  ],
});
```

## Model Options

```typescript
const stream = chat({
  adapter: bedrockText("amazon.nova-pro-v1:0"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    inferenceConfig: {
      maxTokens: 1024,
      temperature: 0.7,
      topP: 0.9,
    },
    stop_sequences: ["END"],
    top_k: 50,
  },
});
```

## Supported Models

### Amazon Nova

| Model | ID | Context | Inputs |
|-------|----|---------|--------|
| Nova Pro | `amazon.nova-pro-v1:0` | 300K | text, image, video, document |
| Nova Lite | `amazon.nova-lite-v1:0` | 300K | text, image, video, document |
| Nova Micro | `amazon.nova-micro-v1:0` | 128K | text only |

### Anthropic Claude (via Bedrock)

| Model | ID | Context | Inputs |
|-------|----|---------|--------|
| Claude Sonnet 4.5 | `anthropic.claude-sonnet-4-5-20250929-v1:0` | 1M | text, image, document |
| Claude Haiku 4.5 | `anthropic.claude-haiku-4-5-20251001-v1:0` | 200K | text, image, document |

Both Claude models support extended thinking.

## API Reference

### `bedrockText(model, config?)`

Creates a Bedrock text adapter using environment variable credentials.

**Parameters:**

- `model` - The Bedrock model ID (e.g., `amazon.nova-pro-v1:0`)
- `config` (optional) - Partial configuration object:
  - `region` - AWS region (falls back to `AWS_REGION` / `AWS_DEFAULT_REGION`)
  - `credentials.accessKeyId` - AWS access key (falls back to `AWS_ACCESS_KEY_ID`)
  - `credentials.secretAccessKey` - AWS secret key (falls back to `AWS_SECRET_ACCESS_KEY`)

**Returns:** A `BedrockTextAdapter` instance.

### `createBedrockChat(model, config)`

Creates a Bedrock text adapter with explicit credentials.

**Parameters:**

- `model` - The Bedrock model ID
- `config` - Full configuration object:
  - `region` - AWS region (required)
  - `credentials.accessKeyId` - AWS access key (required)
  - `credentials.secretAccessKey` - AWS secret key (required)

**Returns:** A `BedrockTextAdapter` instance.

## Limitations

- **Structured output**: Not yet supported via the Converse API (planned).
- **Nova Micro**: Text-only; does not support image, video, or document inputs.
- **Thinking for Claude**: Only supported on the first turn of a conversation.

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Multimodal Content](../guides/multimodal-content) - Using images and documents
- [Other Adapters](./anthropic) - Explore other providers
