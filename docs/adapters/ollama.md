# Ollama Adapter

The Ollama adapter provides access to local models running via Ollama, allowing you to run AI models on your own infrastructure.

## Installation

```bash
npm install @tanstack/ai-ollama
```

## Basic Usage

```typescript
import { ai } from "@tanstack/ai";
import { ollama } from "@tanstack/ai-ollama";

const aiInstance = ai(ollama({
  baseURL: "http://localhost:11434", // Default Ollama URL
}));
```

## Configuration

```typescript
import { ollama, type OllamaConfig } from "@tanstack/ai-ollama";

const config: OllamaConfig = {
  baseURL: "http://localhost:11434", // Ollama server URL
  // No API key needed for local Ollama
};

const aiInstance = ai(ollama(config));
```

## Available Models

Ollama models depend on what you have installed locally. Common models include:

- `llama2` - Llama 2
- `llama3` - Llama 3
- `mistral` - Mistral
- `codellama` - Code Llama
- `phi` - Phi models
- `gemma` - Gemma models

To see available models, run:

```bash
ollama list
```

## Example: Chat Completion

```typescript
import { ai, toStreamResponse } from "@tanstack/ai";
import { ollama } from "@tanstack/ai-ollama";

const aiInstance = ai(ollama({
  baseURL: "http://localhost:11434",
}));

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = aiInstance.chat({
    messages,
    model: "llama3", // Use a model you have installed
  });

  return toStreamResponse(stream);
}
```

## Example: With Tools

```typescript
import { tool } from "@tanstack/ai";
import { z } from "zod";

const getLocalData = tool({
  description: "Get data from local storage",
  inputSchema: z.object({
    key: z.string(),
  }),
  execute: async ({ key }) => {
    // Access local data
    return { data: "..." };
  },
});

const stream = aiInstance.chat({
  messages,
  model: "llama3",
  tools: [getLocalData],
});
```

## Setting Up Ollama

1. **Install Ollama:**
   ```bash
   # macOS
   brew install ollama
   
   # Linux
   curl -fsSL https://ollama.com/install.sh | sh
   
   # Windows
   # Download from https://ollama.com
   ```

2. **Pull a model:**
   ```bash
   ollama pull llama3
   ```

3. **Start Ollama server:**
   ```bash
   ollama serve
   ```

## Provider Options

Ollama supports various provider-specific options:

```typescript
const stream = aiInstance.chat({
  messages,
  model: "llama3",
  providerOptions: {
    temperature: 0.7,
    numPredict: 1000,
    topP: 0.9,
    topK: 40,
  },
});
```

## Custom Ollama Server

If you're running Ollama on a different host or port:

```typescript
const aiInstance = ai(ollama({
  baseURL: "http://your-server:11434",
}));
```

## API Reference

### `ollama(config)`

Creates an Ollama adapter instance.

**Parameters:**
- `config.baseURL` - Ollama server URL (default: `http://localhost:11434`)

**Returns:** An Ollama adapter instance.

## Benefits of Ollama

- ✅ **Privacy** - Data stays on your infrastructure
- ✅ **Cost** - No API costs
- ✅ **Customization** - Use any compatible model
- ✅ **Offline** - Works without internet

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Other Adapters](./openai) - Explore other providers

