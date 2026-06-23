---
title: OpenAI-Compatible Adapter
id: openai-compatible-adapter
description: "Use any OpenAI-compatible provider (DeepSeek, Moonshot/Kimi, Together, Fireworks, Cerebras, Qwen, Perplexity, local servers, and more) in TanStack AI with one generic adapter."
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
  - adapter
---

Many providers expose the OpenAI **Chat Completions** API (`/chat/completions`) — DeepSeek, Moonshot/Kimi, Together, Fireworks, Cerebras, Alibaba Qwen, Perplexity, NVIDIA NIM, and local servers like LM Studio, Ollama, and vLLM. Instead of a dedicated package per provider, TanStack AI ships one generic adapter: point it at any compatible `baseURL`, give it your models, and you get the same type-safe `chat()` experience as the first-class adapters.

Use this when your provider speaks the OpenAI Chat Completions wire format but doesn't have its own `@tanstack/ai-*` package. If a dedicated adapter exists (OpenAI, Grok, Groq, OpenRouter), prefer it — those carry curated per-model metadata.

## Installation

The adapter ships inside `@tanstack/ai-openai` under the `/compatible` subpath — no extra install:

```bash
npm install @tanstack/ai-openai
```

## Basic Usage

Configure the provider once with `openaiCompatible({ baseURL, apiKey, models })`, then select a model per call. The returned model name is a type-safe union of the models you declared:

```typescript
import { chat } from "@tanstack/ai";
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

const deepseek = openaiCompatible({
  name: "deepseek", // optional label shown in devtools/errors (default: "openai-compatible")
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  models: ["deepseek-chat", "deepseek-reasoner"],
});

const stream = chat({
  adapter: deepseek("deepseek-chat"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

`deepseek("deepseek-reasoner")` is valid; `deepseek("gpt-4o")` is a type error — only declared models are accepted.

## One-Shot Usage

For a single model, skip the provider-factory and build the adapter inline with `openaiCompatibleText`:

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

## Declaring Models

The `models` array accepts two forms, which you can mix:

- **A bare string** — gets optimistic defaults: `text` + `image` input, with `streaming`, `function_calling`, and `structured_outputs` support. Good for mainstream chat models.
- **A `createModel(name, capabilities)` definition** — declares precise per-model capabilities so the types match reality (e.g. a reasoning model with no image input).

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";
import { createModel } from "@tanstack/ai";

const provider = openaiCompatible({
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  models: [
    "deepseek-chat", // string → optimistic defaults
    createModel("deepseek-reasoner", {
      input: ["text"], // text only
      features: ["reasoning", "structured_outputs"],
    }),
  ],
});
```

> Capabilities are enforced at the type level. If a provider rejects a feature at runtime (e.g. tools on a model that doesn't support them), declare that model with `createModel` and omit the unsupported feature so the types stop you from calling it.

## Configuration

`openaiCompatible` accepts every OpenAI SDK `ClientOptions` field besides `apiKey`/`baseURL` (which are required and promoted to the top level). The most useful are `defaultHeaders` and `defaultQuery`, for providers that need extra auth or routing parameters:

```typescript
const provider = openaiCompatible({
  baseURL: "https://api.example.com/v1",
  apiKey: process.env.EXAMPLE_API_KEY!,
  models: ["some-model"],
  defaultHeaders: { "X-Custom-Header": "value" },
  defaultQuery: { "api-version": "2026-01-01" },
});
```

## Chat Completions vs Responses

By default the adapter targets the **Chat Completions** API (`/chat/completions`) — the surface virtually every compatible provider implements. For the rare provider that also implements OpenAI's **Responses** API (e.g. Azure OpenAI), opt in with `api: "responses"`:

```typescript
const provider = openaiCompatible({
  baseURL: "https://my-resource.openai.azure.com/openai/v1",
  apiKey: process.env.AZURE_OPENAI_API_KEY!,
  models: ["gpt-4o"],
  api: "responses", // default is "chat-completions"
});
```

## Supported Providers

Any provider implementing the OpenAI Chat Completions API works. Common ones are below — **verify the `baseURL` and model ids against each provider's current docs**, since they change over time. Set the API key via the provider's own environment variable and pass it as `apiKey`.

| Provider | `baseURL` | Example model |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat`, `deepseek-reasoner` |
| Moonshot / Kimi | `https://api.moonshot.ai/v1` | `kimi-k2-0711-preview` |
| Alibaba Qwen (DashScope, intl) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `qwen-max`, `qwen-plus` |
| Alibaba Qwen (DashScope, China) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-max` |
| Together AI | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| Fireworks AI | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p3-70b-instruct` |
| Cerebras | `https://api.cerebras.ai/v1` | `llama-3.3-70b` |
| DeepInfra | `https://api.deepinfra.com/v1/openai` | `meta-llama/Llama-3.3-70B-Instruct` |
| Perplexity | `https://api.perplexity.ai` | `sonar`, `sonar-pro` |
| Requesty | `https://router.requesty.ai/v1` | `openai/gpt-4o-mini` |
| Mistral | `https://api.mistral.ai/v1` | `mistral-large-latest` |
| Nebius | `https://api.studio.nebius.ai/v1` | `meta-llama/Llama-3.3-70B-Instruct` |
| Z.AI (GLM) | `https://api.z.ai/api/paas/v4` | `glm-4.6` |
| Baseten | `https://inference.baseten.co/v1` | model-dependent |
| Hugging Face (router) | `https://router.huggingface.co/v1` | `meta-llama/Llama-3.3-70B-Instruct` |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `meta/llama-3.3-70b-instruct` |

## Local & Self-Hosted Servers

Point the adapter at any local OpenAI-compatible server. The API key is usually a placeholder:

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

// LM Studio
const lmstudio = openaiCompatible({
  name: "lmstudio",
  baseURL: "http://localhost:1234/v1",
  apiKey: "lm-studio",
  models: ["local-model"],
});

// vLLM
const vllm = openaiCompatible({
  name: "vllm",
  baseURL: "http://localhost:8000/v1",
  apiKey: "not-needed",
  models: ["meta-llama/Llama-3.3-70B-Instruct"],
});

// Ollama's OpenAI-compatible endpoint
const ollama = openaiCompatible({
  name: "ollama",
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama",
  models: ["llama3.3"],
});
```

> Ollama also has a dedicated adapter, [`@tanstack/ai-ollama`](./ollama), which understands its native API. Use `openaiCompatible` only if you specifically want Ollama's OpenAI-compatible surface.

## Azure OpenAI

Azure uses a resource-scoped URL and a separate API-version. Use the `/openai/v1` endpoint with `defaultQuery` for the version and `defaultHeaders` for the `api-key` header:

```typescript
const azure = openaiCompatible({
  name: "azure",
  baseURL: "https://YOUR_RESOURCE.openai.azure.com/openai/v1",
  apiKey: process.env.AZURE_OPENAI_API_KEY!, // also sent as Bearer; Azure accepts the api-key header below
  models: ["gpt-4o"], // your Azure deployment name
  defaultQuery: { "api-version": "2026-01-01-preview" },
  defaultHeaders: { "api-key": process.env.AZURE_OPENAI_API_KEY! },
});
```

> Confirm the current `api-version` and endpoint shape in Azure's documentation — Azure's API surface evolves independently of OpenAI's.

## Example: With Tools

Tools work exactly as they do with any other adapter, for models that support function calling:

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

## Next Steps

- [OpenAI Adapter](./openai) - The first-class OpenAI adapter
- [OpenRouter Adapter](./openrouter) - Access 300+ models through one gateway
- [Tools Guide](../tools/tools) - Learn about tools
- [Extending Adapters](../advanced/extend-adapter) - Add custom models to any adapter
