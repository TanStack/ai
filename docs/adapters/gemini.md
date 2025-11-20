# Google Gemini Adapter

The Google Gemini adapter provides access to Google's Gemini models, including Gemini Pro and Gemini Ultra.

## Installation

```bash
npm install @tanstack/ai-gemini
```

## Basic Usage

```typescript
import { ai } from "@tanstack/ai";
import { gemini } from "@tanstack/ai-gemini";

const aiInstance = ai(gemini({
  apiKey: process.env.GEMINI_API_KEY!,
}));
```

## Configuration

```typescript
import { gemini, type GeminiConfig } from "@tanstack/ai-gemini";

const config: GeminiConfig = {
  apiKey: process.env.GEMINI_API_KEY!,
  baseURL: "https://generativelanguage.googleapis.com/v1", // Optional
};

const aiInstance = ai(gemini(config));
```

## Available Models

### Chat Models

- `gemini-pro` - Gemini Pro model
- `gemini-pro-vision` - Gemini Pro with vision capabilities
- `gemini-ultra` - Gemini Ultra model (when available)

## Example: Chat Completion

```typescript
import { ai, toStreamResponse } from "@tanstack/ai";
import { gemini } from "@tanstack/ai-gemini";

const aiInstance = ai(gemini({
  apiKey: process.env.GEMINI_API_KEY!,
}));

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = aiInstance.chat({
    messages,
    model: "gemini-pro",
  });

  return toStreamResponse(stream);
}
```

## Example: With Tools

```typescript
import { tool } from "@tanstack/ai";
import { z } from "zod";

const getCalendarEvents = tool({
  description: "Get calendar events",
  inputSchema: z.object({
    date: z.string(),
  }),
  execute: async ({ date }) => {
    // Fetch calendar events
    return { events: [...] };
  },
});

const stream = aiInstance.chat({
  messages,
  model: "gemini-pro",
  tools: [getCalendarEvents],
});
```

## Provider Options

Gemini supports various provider-specific options:

```typescript
const stream = aiInstance.chat({
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

