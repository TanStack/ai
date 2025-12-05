---
title: Anthropic Adapter
slug: /adapters/anthropic
---

The Anthropic adapter provides access to Claude models, including Claude 3.5 Sonnet, Claude 3 Opus, and more.

## Installation

```bash
npm install @tanstack/ai-anthropic
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { anthropic } from "@tanstack/ai-anthropic";

const adapter = anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
  model: "claude-3-5-sonnet-20241022",
});
```

## Configuration

```typescript
import { anthropic, type AnthropicConfig } from "@tanstack/ai-anthropic";

const config: AnthropicConfig = {
  apiKey: process.env.ANTHROPIC_API_KEY!,
};

const adapter = anthropic(config);
```

## Available Models

### Chat Models

- `claude-3-5-sonnet-20241022` - Latest Claude 3.5 Sonnet
- `claude-3-5-sonnet-20240620` - Claude 3.5 Sonnet
- `claude-3-opus-20240229` - Claude 3 Opus
- `claude-3-sonnet-20240229` - Claude 3 Sonnet
- `claude-3-haiku-20240307` - Claude 3 Haiku
- `claude-2.1` - Claude 2.1
- `claude-2.0` - Claude 2.0

## Example: Chat Completion

```typescript
import { chat, toStreamResponse } from "@tanstack/ai";
import { anthropic } from "@tanstack/ai-anthropic";

const adapter = anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter,
    messages,
    model: "claude-3-5-sonnet-20241022",
  });

  return toStreamResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { anthropic } from "@tanstack/ai-anthropic";
import { z } from "zod";

const adapter = anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const searchDatabaseDef = toolDefinition({
  name: "search_database",
  description: "Search the database",
  inputSchema: z.object({
    query: z.string(),
  }),
});

const searchDatabase = searchDatabaseDef.server(async ({ query }) => {
  // Search database
  return { results: [...] };
});

const stream = chat({
  adapter,
  messages,
  model: "claude-3-5-sonnet-20241022",
  tools: [searchDatabase],
});
```

## Provider Options

Anthropic supports provider-specific options:

```typescript
const stream = chat({
  adapter: anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }),
  messages,
  model: "claude-3-5-sonnet-20241022",
  providerOptions: {
    thinking: {
      type: "enabled",
      budgetTokens: 1000,
    },
    cacheControl: {
      type: "ephemeral",
      ttl: "5m",
    },
    sendReasoning: true,
  },
});
```

### Thinking (Extended Thinking)

Enable extended thinking with a token budget. This allows Claude to show its reasoning process, which is streamed as `thinking` chunks and displayed as `ThinkingPart` in messages:

```typescript
providerOptions: {
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

Cache prompts for better performance:

```typescript
providerOptions: {
  cacheControl: {
    type: "ephemeral",
    ttl: "5m", // Cache TTL: '5m' or '1h'
  },
}
```

## Environment Variables

Set your API key in environment variables:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

## API Reference

### `anthropic(config)`

Creates an Anthropic adapter instance.

**Parameters:**

- `config.apiKey` - Anthropic API key (required)

**Returns:** An Anthropic adapter instance.

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Other Adapters](./openai) - Explore other providers
