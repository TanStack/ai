---
title: Anthropic Adapter
id: anthropic-adapter
---

The Anthropic adapter provides access to Claude models, including Claude Sonnet 4.5, Claude Opus 4.5, and more.

## Installation

```bash
npm install @tanstack/ai-anthropic
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { anthropicChat } from "@tanstack/ai-anthropic";

const adapter = anthropicChat();

const stream = chat({
  adapter,
  model: "claude-sonnet-4-5-20250929",
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Basic Usage - Custom API Key

```typescript
import { chat } from "@tanstack/ai";
import { createAnthropicChat } from "@tanstack/ai-anthropic";

const adapter = createAnthropicChat(process.env.ANTHROPIC_API_KEY!, {
  // ... your config options
});

const stream = chat({
  adapter,
  model: "claude-sonnet-4-5-20250929",
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Configuration

```typescript
import { createAnthropicChat, type AnthropicChatConfig } from "@tanstack/ai-anthropic";

const config: Omit<AnthropicChatConfig, 'apiKey'> = {
  baseURL: "https://api.anthropic.com", // Optional, for custom endpoints
};

const adapter = createAnthropicChat(process.env.ANTHROPIC_API_KEY!, config);
```

## Available Models

### Chat Models

- `claude-sonnet-4-5-20250929` - Claude Sonnet 4.5 (balanced)
- `claude-opus-4-5-20251101` - Claude Opus 4.5 (most capable)
- `claude-haiku-4-0-20250514` - Claude Haiku 4.0 (fastest)
- `claude-3-5-sonnet-20241022` - Claude 3.5 Sonnet
- `claude-3-opus-20240229` - Claude 3 Opus

## Example: Chat Completion

```typescript
import { chat, toStreamResponse } from "@tanstack/ai";
import { anthropicChat } from "@tanstack/ai-anthropic";

const adapter = anthropicChat();

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter,
    model: "claude-sonnet-4-5-20250929",
    messages,
  });

  return toStreamResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { anthropicChat } from "@tanstack/ai-anthropic";
import { z } from "zod";

const adapter = anthropicChat();

const searchDatabaseDef = toolDefinition({
  name: "search_database",
  description: "Search the database",
  inputSchema: z.object({
    query: z.string(),
  }),
});

const searchDatabase = searchDatabaseDef.server(async ({ query }) => {
  // Search database
  return { results: [] };
});

const stream = chat({
  adapter,
  model: "claude-sonnet-4-5-20250929",
  messages,
  tools: [searchDatabase],
});
```

## Provider Options

Anthropic supports various provider-specific options:

```typescript
const stream = chat({
  adapter: anthropicChat(),
  model: "claude-sonnet-4-5-20250929",
  messages,
  modelOptions: {
    max_tokens: 4096,
    temperature: 0.7,
    top_p: 0.9,
    top_k: 40,
    stop_sequences: ["END"],
  },
});
```

### Thinking (Extended Thinking)

Enable extended thinking with a token budget. This allows Claude to show its reasoning process, which is streamed as `thinking` chunks:

```typescript
modelOptions: {
  thinking: {
    type: "enabled",
    budget_tokens: 2048, // Maximum tokens for thinking
  },
}
```

**Note:** `max_tokens` must be greater than `budget_tokens`. The adapter automatically adjusts `max_tokens` if needed.

**Supported Models:**

- `claude-sonnet-4-5-20250929` and newer
- `claude-opus-4-5-20251101` and newer

When thinking is enabled, the model's reasoning process is streamed separately from the response text and appears as a collapsible thinking section in the UI.

### Prompt Caching

Cache prompts for better performance and reduced costs:

```typescript
const stream = chat({
  adapter: anthropicChat(),
  model: "claude-sonnet-4-5-20250929",
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          content: "What is the capital of France?",
          metadata: {
            cache_control: {
              type: "ephemeral",
            },
          },
        },
      ],
    },
  ],
  model: "claude-sonnet-4-5-20250929",
});
```

## Summarization

Anthropic supports text summarization:

```typescript
import { ai } from "@tanstack/ai";
import { anthropicSummarize } from "@tanstack/ai-anthropic";

const adapter = anthropicSummarize();

const result = await summarize({
  adapter,
  model: "claude-sonnet-4-5-20250929",
  text: "Your long text to summarize...",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});

console.log(result.summary);
```

## Environment Variables

Set your API key in environment variables:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

## API Reference

### `anthropicChat(config?)`

Creates an Anthropic chat adapter using environment variables.

**Returns:** An Anthropic chat adapter instance.

### `createAnthropicChat(apiKey, config?)`

Creates an Anthropic chat adapter with an explicit API key.

**Parameters:**

- `apiKey` - Your Anthropic API key
- `config.baseURL?` - Custom base URL (optional)

**Returns:** An Anthropic chat adapter instance.

### `anthropicSummarize(config?)`

Creates an Anthropic summarization adapter using environment variables.

**Returns:** An Anthropic summarize adapter instance.

### `createAnthropicSummarize(apiKey, config?)`

Creates an Anthropic summarization adapter with an explicit API key.

**Parameters:**

- `apiKey` - Your Anthropic API key
- `config.baseURL?` - Custom base URL (optional)

**Returns:** An Anthropic summarize adapter instance.

## Limitations

- **Embeddings**: Anthropic does not support embeddings natively. Use OpenAI or Gemini for embedding needs.
- **Image Generation**: Anthropic does not support image generation. Use OpenAI or Gemini for image generation.

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Other Adapters](./openai) - Explore other providers
