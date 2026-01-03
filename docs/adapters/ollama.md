---
title: Ollama
id: ollama-adapter
order: 4
---

The Ollama adapter provides access to local models running via Ollama, allowing you to run AI models on your own infrastructure with full privacy and no API costs.

## Installation

```bash
npm install @tanstack/ai-ollama
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { ollamaText } from "@tanstack/ai-ollama";

const stream = chat({
  adapter: ollamaText("llama3"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Basic Usage - Custom Host

```typescript
import { chat } from "@tanstack/ai";
import { createOllamaChat } from "@tanstack/ai-ollama";

const adapter = createOllamaChat("http://your-server:11434");

const stream = chat({
  adapter: adapter("llama3"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Configuration

```typescript
import { createOllamaChat } from "@tanstack/ai-ollama";

// Default localhost
const adapter = createOllamaChat();

// Custom host
const adapter = createOllamaChat("http://your-server:11434");
```

## Available Models

To see available models on your Ollama instance:

```bash
ollama list
```

### Popular Models

- `llama3` / `llama3.1` / `llama3.2` - Meta's Llama models
- `mistral` / `mistral:7b` - Mistral AI models
- `mixtral` - Mixtral MoE model
- `codellama` - Code-focused Llama
- `phi3` - Microsoft's Phi models
- `gemma` / `gemma2` - Google's Gemma models
- `qwen2` / `qwen2.5` - Alibaba's Qwen models
- `deepseek-coder` - DeepSeek coding model

## Example: Chat Completion

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { ollamaText } from "@tanstack/ai-ollama";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: ollamaText("llama3"),
    messages,
  });

  return toServerSentEventsResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { ollamaText } from "@tanstack/ai-ollama";
import { z } from "zod";

const getLocalDataDef = toolDefinition({
  name: "get_local_data",
  description: "Get data from local storage",
  inputSchema: z.object({
    key: z.string(),
  }),
});

const getLocalData = getLocalDataDef.server(async ({ key }) => {
  // Access local data
  return { data: "..." };
});

const stream = chat({
  adapter: ollamaText("llama3"),
  messages,
  tools: [getLocalData],
});
```

**Note:** Tool support varies by model. Models like `llama3`, `mistral`, and `qwen2` generally have good tool calling support.

## Model Options

Ollama supports various provider-specific options:

```typescript
const stream = chat({
  adapter: ollamaText("llama3"),
  messages,
  modelOptions: {
    temperature: 0.7,
    top_p: 0.9,
    top_k: 40,
    num_predict: 1000, // Max tokens to generate
    repeat_penalty: 1.1,
    num_ctx: 4096, // Context window size
    num_gpu: -1, // GPU layers (-1 = auto)
  },
});
```

### Advanced Options

```typescript
modelOptions: {
  // Sampling
  temperature: 0.7,
  top_p: 0.9,
  top_k: 40,
  min_p: 0.05,
  typical_p: 1.0,
  
  // Generation
  num_predict: 1000,
  repeat_penalty: 1.1,
  repeat_last_n: 64,
  penalize_newline: false,
  
  // Performance
  num_ctx: 4096,
  num_batch: 512,
  num_gpu: -1,
  num_thread: 0, // 0 = auto
  
  // Memory
  use_mmap: true,
  use_mlock: false,
  
  // Mirostat sampling
  mirostat: 0, // 0 = disabled, 1 = Mirostat, 2 = Mirostat 2.0
  mirostat_tau: 5.0,
  mirostat_eta: 0.1,
}
```

## Summarization

Summarize long text content locally:

```typescript
import { summarize } from "@tanstack/ai";
import { ollamaSummarize } from "@tanstack/ai-ollama";

const result = await summarize({
  adapter: ollamaSummarize("llama3"),
  text: "Your long text to summarize...",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});

console.log(result.summary);
```

## Setting Up Ollama

### 1. Install Ollama

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows
# Download from https://ollama.com
```

### 2. Pull a Model

```bash
ollama pull llama3
```

### 3. Start Ollama Server

```bash
ollama serve
```

The server runs on `http://localhost:11434` by default.

## Running on a Remote Server

```typescript
const adapter = createOllamaChat("http://your-server:11434");
```

To expose Ollama on a network interface:

```bash
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

## Environment Variables

Optionally set the host in environment variables:

```bash
OLLAMA_HOST=http://localhost:11434
```

## API Reference

### `ollamaText(options?)`

Creates an Ollama text/chat adapter.

**Parameters:**

- `options.model?` - Default model (optional)

**Returns:** An Ollama text adapter instance.

### `createOllamaText(host?, options?)`

Creates an Ollama text/chat adapter with a custom host.

**Parameters:**

- `host` - Ollama server URL (default: `http://localhost:11434`)
- `options.model?` - Default model (optional)

**Returns:** An Ollama text adapter instance.

### `ollamaSummarize(options?)`

Creates an Ollama summarization adapter.

**Returns:** An Ollama summarize adapter instance.

### `createOllamaSummarize(host?, options?)`

Creates an Ollama summarization adapter with a custom host.

**Returns:** An Ollama summarize adapter instance.

## Benefits of Ollama

- ✅ **Privacy** - Data stays on your infrastructure
- ✅ **Cost** - No API costs after hardware
- ✅ **Customization** - Use any compatible model
- ✅ **Offline** - Works without internet
- ✅ **Speed** - No network latency for local deployment

## Limitations

- **Image Generation**: Ollama does not support image generation. Use OpenAI or Gemini for image generation.
- **Performance**: Depends on your hardware (GPU recommended for larger models)

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Other Adapters](./openai) - Explore other providers
