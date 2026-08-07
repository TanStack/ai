---
title: OpenAI-Compatible Adapter
id: openai-compatible-adapter
description: "Any OpenAI Chat Completions provider (DeepSeek, Kimi, Together, local servers, LiteLLM) via one generic adapter."
keywords:
  - tanstack ai
  - openai compatible
  - deepseek
  - moonshot
  - kimi
  - together
  - fireworks
  - cerebras
  - qwen
  - perplexity
  - lm studio
  - vllm
  - litellm
  - adapter
---

If your provider speaks OpenAI `/chat/completions` but has no `@tanstack/ai-*` package → use `openaiCompatible`. Prefer dedicated adapters (OpenAI, Grok, Groq, OpenRouter) when they exist.

## Install

Ships in `@tanstack/ai-openai` under `/compatible`:

```bash
npm install @tanstack/ai-openai
```

## Do this

1. Configure once with `baseURL`, `apiKey`, `models`.
2. Select a model per call (type-safe union of declared models).

```typescript
import { chat } from "@tanstack/ai";
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

const deepseek = openaiCompatible({
  name: "deepseek",
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  models: ["deepseek-chat", "deepseek-reasoner"],
});

const stream = chat({
  adapter: deepseek("deepseek-chat"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

### One-shot

```typescript
import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";

const stream = chat({
  adapter: openaiCompatibleText("deepseek-chat", {
    baseURL: "https://api.deepseek.com/v1",
    apiKey: process.env.DEEPSEEK_API_KEY!,
  }),
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Declaring models

- **String** → optimistic defaults: text+image input, streaming, function_calling, structured_outputs
- **`createModel(name, capabilities)`** → precise features (e.g. no image)

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";
import { createModel } from "@tanstack/ai";

const provider = openaiCompatible({
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  models: [
    "deepseek-chat",
    createModel("deepseek-reasoner", {
      input: ["text"],
      features: ["reasoning", "structured_outputs"],
    }),
  ],
});
```

Omit unsupported features so types block bad calls.

## Configuration

All OpenAI SDK `ClientOptions` except `apiKey`/`baseURL` (required at top level). Useful: `defaultHeaders`, `defaultQuery`.

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

const provider = openaiCompatible({
  baseURL: "https://api.example.com/v1",
  apiKey: process.env.EXAMPLE_API_KEY!,
  models: ["some-model"],
  defaultHeaders: { "X-Custom-Header": "value" },
  defaultQuery: { "api-version": "2026-01-01" },
});
```

### Responses API

Default is Chat Completions. Opt in:

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

const provider = openaiCompatible({
  baseURL: "https://my-resource.openai.azure.com/openai/v1",
  apiKey: process.env.AZURE_OPENAI_API_KEY!,
  models: ["gpt-4o"],
  api: "responses", // default: "chat-completions"
});
```

## Providers (verify baseURL/models in their docs)

| Provider | `baseURL` | Example model |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Moonshot / Kimi | `https://api.moonshot.ai/v1` | `kimi-k2-0711-preview` |
| Qwen (intl) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `qwen-max` |
| Qwen (China) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-max` |
| Together | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| Fireworks | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p3-70b-instruct` |
| Cerebras | `https://api.cerebras.ai/v1` | `llama-3.3-70b` |
| DeepInfra | `https://api.deepinfra.com/v1/openai` | `meta-llama/Llama-3.3-70B-Instruct` |
| Perplexity | `https://api.perplexity.ai` | `sonar` |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `meta/llama-3.3-70b-instruct` |

Also: Requesty, Mistral, Nebius, Z.AI, Baseten, Hugging Face router, …

## Local servers

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

const lmstudio = openaiCompatible({
  name: "lmstudio",
  baseURL: "http://localhost:1234/v1",
  apiKey: "lm-studio",
  models: ["local-model"],
});

const vllm = openaiCompatible({
  name: "vllm",
  baseURL: "http://localhost:8000/v1",
  apiKey: "not-needed",
  models: ["meta-llama/Llama-3.3-70B-Instruct"],
});

const ollama = openaiCompatible({
  name: "ollama",
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama",
  models: ["llama3.3"],
});
```

Ollama native API: [`@tanstack/ai-ollama`](./ollama).

## LiteLLM

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

const litellm = openaiCompatible({
  name: "litellm",
  baseURL: "http://localhost:4000/v1",
  apiKey: process.env.LITELLM_API_KEY!,
  models: [
    "anthropic/claude-sonnet-5",
    "openai/gpt-5.5",
    "gemini/gemini-3.5-flash",
  ],
});
```

`apiKey` is the proxy virtual key, not upstream credentials.

## Azure OpenAI

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

const azure = openaiCompatible({
  name: "azure",
  baseURL: "https://YOUR_RESOURCE.openai.azure.com/openai/v1",
  apiKey: process.env.AZURE_OPENAI_API_KEY!,
  models: ["gpt-4o"],
  defaultQuery: { "api-version": "2026-01-01-preview" },
  defaultHeaders: { "api-key": process.env.AZURE_OPENAI_API_KEY! },
});
```

Confirm `api-version` in Azure docs.

## Tools

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { openaiCompatible } from "@tanstack/ai-openai/compatible";
import { z } from "zod";

const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get the current weather",
  inputSchema: z.object({ location: z.string() }),
});

const getWeather = getWeatherDef.server(async ({ location }) => {
  return { temperature: 72, conditions: "sunny" };
});

const deepseek = openaiCompatible({
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  models: ["deepseek-chat"],
});

const stream = chat({
  adapter: deepseek("deepseek-chat"),
  messages: [{ role: "user", content: "What's the weather in Tokyo?" }],
  tools: [getWeather],
});
```

## Next steps

- [OpenAI Adapter](./openai)
- [OpenRouter Adapter](./openrouter)
- [Tools](../tools/tools)
- [Extending Adapters](../advanced/extend-adapter)
