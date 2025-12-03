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

const adapter = gemini({
  apiKey: process.env.GEMINI_API_KEY!,
});

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
  model: "gemini-pro",
});
```

## Configuration

```typescript
import { gemini, type GeminiConfig } from "@tanstack/ai-gemini";

const config: GeminiConfig = {
  apiKey: process.env.GEMINI_API_KEY!,
  baseURL: "https://generativelanguage.googleapis.com/v1", // Optional
};

const adapter = gemini(config);
```

## Available Models

### Chat Models

- `gemini-pro` - Gemini Pro model
- `gemini-pro-vision` - Gemini Pro with vision capabilities
- `gemini-ultra` - Gemini Ultra model (when available)

## Example: Chat Completion

```typescript
import { chat, toStreamResponse } from "@tanstack/ai";
import { gemini } from "@tanstack/ai-gemini";

const adapter = gemini({
  apiKey: process.env.GEMINI_API_KEY!,
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter,
    messages,
    model: "gemini-pro",
  });

  return toStreamResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { gemini } from "@tanstack/ai-gemini";
import { z } from "zod";

const adapter = gemini({
  apiKey: process.env.GEMINI_API_KEY!,
});

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
  model: "gemini-pro",
  tools: [getCalendarEvents],
});
```

## Provider Options

Gemini supports various provider-specific options:

```typescript
const stream = chat({
  adapter: gemini({ apiKey: process.env.GEMINI_API_KEY! }),
  messages,
  model: "gemini-pro",
  providerOptions: {
    temperature: 0.7,
    maxOutputTokens: 1000,
    topP: 0.9,
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
