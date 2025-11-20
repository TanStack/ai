# Anthropic Adapter

The Anthropic adapter provides access to Claude models, including Claude 3.5 Sonnet, Claude 3 Opus, and more.

## Installation

```bash
npm install @tanstack/ai-anthropic
```

## Basic Usage

```typescript
import { ai } from "@tanstack/ai";
import { anthropic } from "@tanstack/ai-anthropic";

const aiInstance = ai(anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
}));
```

## Configuration

```typescript
import { anthropic, type AnthropicConfig } from "@tanstack/ai-anthropic";

const config: AnthropicConfig = {
  apiKey: process.env.ANTHROPIC_API_KEY!,
};

const aiInstance = ai(anthropic(config));
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
import { ai, toStreamResponse } from "@tanstack/ai";
import { anthropic } from "@tanstack/ai-anthropic";

const aiInstance = ai(anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
}));

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = aiInstance.chat({
    messages,
    model: "claude-3-5-sonnet-20241022",
  });

  return toStreamResponse(stream);
}
```

## Example: With Tools

```typescript
import { tool } from "@tanstack/ai";
import { z } from "zod";

const searchDatabase = tool({
  description: "Search the database",
  inputSchema: z.object({
    query: z.string(),
  }),
  execute: async ({ query }) => {
    // Search database
    return { results: [...] };
  },
});

const stream = aiInstance.chat({
  messages,
  model: "claude-3-5-sonnet-20241022",
  tools: [searchDatabase],
});
```

## Provider Options

Anthropic supports provider-specific options:

```typescript
const stream = aiInstance.chat({
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

Enable extended thinking with a token budget:

```typescript
providerOptions: {
  thinking: {
    type: "enabled",
    budgetTokens: 1000, // Maximum tokens for thinking
  },
}
```

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

