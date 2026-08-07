---
title: Ollama
id: ollama-adapter
order: 4
description: "Local Ollama models via @tanstack/ai-ollama — private, offline chat on your hardware."
keywords:
  - tanstack ai
  - ollama
  - local llm
  - self-hosted
  - privacy
  - llama
  - offline ai
  - adapter
---

If you need local models → install Ollama, pull a model, call `ollamaText(model)`.

## Setup Ollama

1. Install Ollama (`brew install ollama`, [install.sh](https://ollama.com/install.sh), or [ollama.com](https://ollama.com)).
2. Pull: `ollama pull llama3`
3. Serve: `ollama serve` (default `http://localhost:11434`)

List models: `ollama list`.

## Install

```bash
npm install @tanstack/ai-ollama
```

Optional:

```bash
OLLAMA_HOST=http://localhost:11434
```

## Do this

```typescript
import { chat } from "@tanstack/ai";
import { ollamaText } from "@tanstack/ai-ollama";

const stream = chat({
  adapter: ollamaText("llama3"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Custom host

```typescript
import { chat } from "@tanstack/ai";
import { createOllamaChat } from "@tanstack/ai-ollama";

const adapter = createOllamaChat("llama3", "http://your-server:11434");
// or: createOllamaChat("llama3", { host: "...", headers: { Authorization: "Bearer ..." } })

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
});
```

Network bind: `OLLAMA_HOST=0.0.0.0:11434 ollama serve`.

### Server + tools

```typescript
import { chat, toServerSentEventsResponse, toolDefinition } from "@tanstack/ai";
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
  return { data: "..." };
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: ollamaText("llama3"),
    messages,
    tools: [getLocalData],
  });

  return toServerSentEventsResponse(stream);
}
```

Tool support varies — `llama3`, `mistral`, `qwen2` generally work.

## Model options

Sampling lives under **`modelOptions.options`** (not root of `modelOptions`):

```typescript
import { chat } from "@tanstack/ai";
import { ollamaText } from "@tanstack/ai-ollama";

const stream = chat({
  adapter: ollamaText("llama3:latest"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    options: {
      temperature: 0.7,
      top_p: 0.9,
      top_k: 40,
      num_predict: 1000,
      repeat_penalty: 1.1,
      num_ctx: 4096,
      num_gpu: -1,
    },
  },
});
```

> Migration map: `temperature` → `modelOptions.options.temperature`, token limit → `num_predict`. See [modelOptions](../migration/sampling-options-to-model-options).

Also under `options`: `min_p`, `typical_p`, `repeat_last_n`, `penalize_newline`, `num_batch`, `num_thread`, `use_mmap`, `use_mlock`, `mirostat`, `mirostat_tau`, `mirostat_eta`.

## Summarization

```typescript ignore
import { summarize } from "@tanstack/ai";
import { ollamaSummarize } from "@tanstack/ai-ollama";

const result = await summarize({
  adapter: ollamaSummarize("llama3"),
  text: "Your long text to summarize...",
  maxLength: 100,
  style: "concise",
});

console.log(result.summary);
```

## Models

Common: `llama3` / `llama3.1` / `llama3.2`, `mistral`, `mixtral`, `codellama`, `phi3`, `gemma` / `gemma2`, `qwen2` / `qwen2.5`, `deepseek-coder`.

## API reference

| Factory | Purpose |
| --- | --- |
| `ollamaText(model)` | Env host (default localhost) |
| `createOllamaChat(model, hostOrConfig?)` | URL string or `{ host, headers, fetch }` |
| `ollamaSummarize` / `createOllamaSummarize` | Same shape |

OpenAI-compatible Ollama endpoint: prefer this adapter for native API, or [openai-compatible](./openai-compatible) for `/v1` surface.

## Notes

- Privacy / offline / no API cost after hardware
- No image generation
- Performance depends on GPU

## Next steps

- [Getting Started](../getting-started/quick-start)
- [Tools](../tools/tools)
- [Other Adapters](./openai)
