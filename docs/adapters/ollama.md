---
title: Ollama
id: ollama-adapter
order: 4
description: "Run local open models with Ollama in TanStack AI with @tanstack/ai-ollama. No API key, no API cost, and your data stays on your hardware."
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

The Ollama adapter calls Qwen, Llama, gpt-oss, and other open models on your machine. It needs no API key and it works offline.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-ollama
vue: @tanstack/ai-ollama
solid: @tanstack/ai-ollama
svelte: @tanstack/ai-ollama
preact: @tanstack/ai-ollama
angular: @tanstack/ai-ollama
vanilla: @tanstack/ai-ollama
octane: @tanstack/ai-ollama

<!-- ::end:tabs -->

## 2. Start Ollama and pull a model

Ollama needs no API key. It needs a running server with a model.

1. Install Ollama:

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows: download the installer from https://ollama.com
```

2. Pull a model:

```bash
ollama pull qwen3:8b
```

3. Start the server:

```bash
ollama serve
```

The server runs on `http://localhost:11434` by default. If your server is somewhere else, set `OLLAMA_HOST`:

```bash
OLLAMA_HOST=http://localhost:11434
```

## 3. Stream a chat from the server

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { ollamaText } from "@tanstack/ai-ollama";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: ollamaText("qwen3:8b"),
    messages,
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
```

`ollamaText` reads the host from `OLLAMA_HOST`. To pass the host in code, use `createOllamaChat("qwen3:8b", "http://your-server:11434")`.

## 4. Render the chat

The client is the same for every provider. Point `useChat` at your route:

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        sendMessage(input);
        setInput("");
      }}
    >
      {messages.map((message) => (
        <p key={message.id}>
          {message.parts
            .map((part) => (part.type === "text" ? part.content : ""))
            .join("")}
        </p>
      ))}
      <input value={input} onChange={(event) => setInput(event.target.value)} />
    </form>
  );
}
```

For Vue, Solid, Svelte, Angular, and the other frameworks, see [Quick Start](../getting-started/quick-start#3-render-the-chat).

You now have a streaming chat with a local model. The speed depends on your hardware. A GPU helps for larger models.

## Tools

[Tools](../tools/tools) work the same as with every adapter. The tool support depends on the model. Models like `llama3`, `mistral`, and `qwen2` call tools well.

### Tool choice

Ollama ignores `toolChoice`. Ollama has no tool choice, so the model decides to call a tool or not, also with `'none'` or `'required'`.

To get no tool calls for a request, do not pass `tools`. For the other providers, see [Choose when the model calls a tool](../tools/tools#choose-when-the-model-calls-a-tool).

## Embeddings

```typescript ignore
import { embed } from "@tanstack/ai";
import { ollamaEmbedding } from "@tanstack/ai-ollama";

const result = await embed({
  adapter: ollamaEmbedding("nomic-embed-text"),
  input: ["a red guitar", "a blue drum kit"],
});

console.log(result.embeddings[0]?.vector);
```

- Pull the model first: `ollama pull nomic-embed-text`.
- The known models get autocomplete: `nomic-embed-text`, `mxbai-embed-large`, `all-minilm`, `snowflake-arctic-embed`, `bge-m3`, and `embeddinggemma`. Any other model name works too.
- Each model has a fixed output size, so the top-level `dimensions` option does not work.

See the [Embeddings guide](../embeddings.md).

## Summarization

```typescript ignore
import { summarize } from "@tanstack/ai";
import { ollamaSummarize } from "@tanstack/ai-ollama";

const result = await summarize({
  adapter: ollamaSummarize("qwen3:8b"),
  text: "Your long text to summarize...",
  threadId: "thread-1",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});

console.log(result.summary);
```

## No image generation

Ollama does not make images. For images, use [OpenAI](./openai) or [Gemini](./gemini).

## Models and options

### Model options

Ollama nests its sampling and runner options in an `options` object **inside** `modelOptions`. This includes `temperature`, `top_p`, and `num_predict` (the token limit):

```typescript
import { chat } from "@tanstack/ai";
import { ollamaText } from "@tanstack/ai-ollama";

const stream = chat({
  adapter: ollamaText("qwen3:8b"),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
  modelOptions: {
    options: {
      temperature: 0.7,
      top_p: 0.9,
      top_k: 40,
      num_predict: 1000, // Max tokens to generate
      repeat_penalty: 1.1,
      num_ctx: 4096, // Context window size
      num_gpu: -1, // GPU layers (-1 = auto)
    },
  },
});
```

Sampling options do not go at the root of `chat()`. For Ollama, they go to `modelOptions.options.temperature`, `modelOptions.options.top_p`, and `modelOptions.options.num_predict`. See [Moving Sampling Options into modelOptions](../migration/sampling-options-to-model-options). The full option list is in [All runner options](#all-runner-options).

### Reasoning

Running a thinking model like Qwen 3 or gpt-oss? Set `reasoning` on `chat()`:

```typescript
import { chat } from "@tanstack/ai";
import { ollamaText } from "@tanstack/ai-ollama";

const stream = chat({
  adapter: ollamaText("qwen3:8b"),
  messages: [{ role: "user", content: "Plan a database migration." }],
  threadId: "thread-1",
  reasoning: "off",
});
```

The adapter sends it as `think`:

| Model | Levels | Sent as |
| --- | --- | --- |
| `qwen3`, `deepseek-r1`, `deepseek-v3.1` | `off`, `high` | `think: false` or `true` |
| `gpt-oss` | `low`, `medium`, `high` | `think: "low"` and so on |
| a model name that this package does not list | `off`, `high` | `think: false` or `true` |

The other listed models take no `reasoning`.

### Models

To see the models on your Ollama server, run:

```bash
ollama list
```

Any model name works. The package knows many families and gives them autocomplete. Some of them:

- `qwen3`, `qwen2.5`, `qwq`: Qwen models from Alibaba.
- `llama4`, `llama3.3`, `llama3.2`, `llama3.1`, `llama3`: Llama models from Meta.
- `gpt-oss`: open-weight models from OpenAI.
- `gemma3`, `deepseek-r1`, `deepseek-v3.1`, `phi4`: models from Google, DeepSeek, and Microsoft.
- `mistral`, `mistral-small`, `mixtral`, `codellama`: Mistral and code models.

The package exports the full list as `OllamaTextModels`.

## Advanced

### Custom host and client config

```typescript
import { createOllamaChat } from "@tanstack/ai-ollama";

// Custom host (URL string)
const adapter = createOllamaChat("qwen3:8b", "http://your-server:11434");

// Custom client config (for example, custom headers)
const adapter2 = createOllamaChat("qwen3:8b", {
  host: "http://your-server:11434",
  headers: { Authorization: "Bearer ..." },
});
```

### Running on a remote server

To make Ollama listen on a network interface, start it with `OLLAMA_HOST`:

```bash
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

Then point the adapter at that server:

```typescript
import { createOllamaChat } from "@tanstack/ai-ollama";

const adapter = createOllamaChat("qwen3:8b", "http://your-server:11434");
```

### Behind a proxy

Send every request through a gateway, such as Cloudflare AI Gateway or a corporate proxy, with `baseURL` and `defaultHeaders`. These two option names are the same on every TanStack AI adapter, so one gateway config works for all of them.

```typescript
import { createOllamaChat } from "@tanstack/ai-ollama";

const adapter = createOllamaChat("qwen3:8b", {
  baseURL: "https://gateway.example.com/ollama",
  defaultHeaders: { Authorization: `Bearer ${process.env.GATEWAY_TOKEN}` },
});
```

- `host` and `headers` are aliases of the same two options. If you set both forms, `baseURL` and `defaultHeaders` win.
- Need more than a fixed header, such as a log of each model call? This adapter supports [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call). An adapter with your own `Ollama` client ignores `wrapFetch` and the abort signal.

### All runner options

All sampling and runner options go in `modelOptions.options`:

```typescript ignore
modelOptions: {
  options: {
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
  },
}
```

### API reference

| Factory | Creates |
| --- | --- |
| `ollamaText(model)` | Chat adapter. Reads the host from `OLLAMA_HOST` (default `http://localhost:11434`) |
| `createOllamaChat(model, hostOrConfig?)` | Chat adapter with an explicit host or client config |
| `ollamaSummarize(model)` / `createOllamaSummarize(model, host?)` | Summarization adapter. `host` is a URL string |
| `ollamaEmbedding(model)` / `createOllamaEmbedding(model, hostOrConfig?)` | Embedding adapter |

- `model`: a model name, for example `"qwen3:8b"` or `"mistral:7b"`.
- `hostOrConfig`: a URL string in the `OLLAMA_HOST` style, or an `OllamaClientConfig` object (for example `{ baseURL, defaultHeaders }`). `host` and `headers` are aliases.
