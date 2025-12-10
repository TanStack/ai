---
title: Gemini Adapter
id: gemini-adapter
---

The Google Gemini adapter provides access to Google's Gemini models, including Gemini Pro and Gemini Ultra.

## Installation

```bash
npm install @tanstack/ai-gemini
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { gemini } from "@tanstack/ai-gemini";

const adapter = gemini();

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
  model: "gemini-2.5-pro",
});
```

## Basic Usage - Custom API Key

```typescript
import { chat } from "@tanstack/ai";
import { createGemini } from "@tanstack/ai-gemini";
const adapter = createGemini(process.env.GEMINI_API_KEY, {
  // ... your config options
 });
const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
  model: "gemini-2.5-pro",
});
```

## Configuration

```typescript
import { gemini, type GeminiConfig } from "@tanstack/ai-gemini";

const config: GeminiConfig = {
  baseURL: "https://generativelanguage.googleapis.com/v1", // Optional
};

const adapter = gemini(config);
```

## Available Models

### Chat Models

- `gemini-2.5-pro` - Gemini Pro model
- `gemini-2.5-pro-vision` - Gemini Pro with vision capabilities
- `gemini-ultra` - Gemini Ultra model (when available)

## Example: Chat Completion

```typescript
import { chat, toStreamResponse } from "@tanstack/ai";
import { gemini } from "@tanstack/ai-gemini";

const adapter = gemini();

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter,
    messages,
    model: "gemini-2.5-pro",
  });

  return toStreamResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { gemini } from "@tanstack/ai-gemini";
import { z } from "zod";

const adapter = gemini();

const getCalendarEventsDef = toolDefinition({
  name: "get_calendar_events",
  description: "Get calendar events",
  inputSchema: z.object({
    date: z.string(),
  }),
});

const getCalendarEvents = getCalendarEventsDef.server(async ({ date }) => {
  // Fetch calendar events
  return { events: [...] };
});

const stream = chat({
  adapter,
  messages,
  model: "gemini-2.5-pro",
  tools: [getCalendarEvents],
});
```

## Provider Options

Gemini supports various provider-specific options:

```typescript
const stream = chat({
  adapter: gemini(),
  messages,
  model: "gemini-2.5-pro",
  providerOptions: { 
    maxOutputTokens: 1000, 
    topK: 40,
  },
});
```

## Environment Variables

Set your API key in environment variables:

```bash
GEMINI_API_KEY=your-api-key-here
```

## Getting an API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Add it to your environment variables

## API Reference

### `gemini(config)`

Creates a Gemini adapter instance.

**Parameters:**

- `config.apiKey` - Gemini API key (required)
- `config.baseURL?` - Custom base URL (optional)

**Returns:** A Gemini adapter instance.

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Other Adapters](./openai) - Explore other providers
