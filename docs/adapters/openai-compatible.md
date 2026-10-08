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
  - litellm
  - adapter
---

Many providers expose the OpenAI **Chat Completions** API (`/chat/completions`) — DeepSeek, Moonshot/Kimi, Together, Fireworks, Cerebras, Alibaba Qwen, Perplexity, NVIDIA NIM, and local servers like LM Studio, Ollama, and vLLM. Instead of a dedicated package per provider, TanStack AI ships one generic adapter: point it at any compatible `baseURL`, give it your models, and you get the same type-safe `chat()` experience as the first-class adapters.

Use this when your provider speaks the OpenAI Chat Completions wire format but doesn't have its own `@tanstack/ai-*` package. If a dedicated adapter exists (OpenAI, Grok, Groq, OpenRouter), prefer it. Those carry curated per-model metadata. For Vercel AI Gateway, install `@tanstack/ai-vercel-gateway` and use `vercelGatewayText`. See [Vercel AI Gateway](./vercel-gateway.md). For Lovable AI Gateway, install `@tanstack/ai-lovable` and use `lovableText` (plus image, video, embeddings, and speech factories). See [Lovable AI Gateway](./lovable.md).

Perplexity Sonar chat stays on this adapter. [`@tanstack/ai-perplexity`](./perplexity.md) is Search/grounding only — it does not replace `openaiCompatible` for `chat()`. Optional: pass `defaultHeaders: getPerplexityIntegrationHeaders()` from that package to send Perplexity's `X-Pplx-Integration` attribution header.

## Installation

The adapter ships inside `@tanstack/ai-openai` under the `/compatible` subpath — no extra install:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-openai
vue: @tanstack/ai-openai
solid: @tanstack/ai-openai
svelte: @tanstack/ai-openai
preact: @tanstack/ai-openai
angular: @tanstack/ai-openai
vanilla: @tanstack/ai-openai
octane: @tanstack/ai-openai

<!-- ::end:tabs -->

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

`deepseek("deepseek-reasoner")` is valid. `deepseek("gpt-5.5")` is a type error. Only declared models are accepted.

## Replay and stream errors

Your provider can receive history from a different model or API. The configured `name` identifies the source provider. Chat Completions uses the `openai-completions` API identity. A compatible Responses adapter uses `openai-responses`.

Keep the assistant's `metadata.tanstack.source` when you save history. The target adapter removes foreign signatures and remaps tool IDs together with their results. See [Keep saved history when you switch](../advanced/runtime-adapter-switching#keep-saved-history-when-you-switch).

The Chat Completions adapter handles tool history and output as follows:

- With tool history and no active tools, it sends `tools: []`.
- Tool-result text stays in the tool message. Supported images follow in a user message.
- Image-only results use `(see attached image)`. An empty result uses `(no tool output)`.
- A text-only model receives an image-omission placeholder without the images.

`delta.content` can be a string, `null`, or absent. An object or array produces `RUN_ERROR`. Unknown finish reasons also produce `RUN_ERROR` with `Provider finish_reason: <reason>`.

Outgoing text removes lone UTF-16 surrogates. These are broken halves of a Unicode character. Valid pairs, such as emoji, stay intact.

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

## Reasoning Models

Reasoning models on OpenAI-compatible endpoints do not agree on the wire format. DeepSeek wants `thinking: { type }`, Qwen wants `enable_thinking`, and some servers reject the `developer` role. Tell the adapter what the provider expects with `compat`, and give each reasoning model its levels:

```typescript
import { chat } from "@tanstack/ai";
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

const deepseek = openaiCompatible({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  compat: {
    thinkingFormat: "deepseek",
    maxTokensField: "max_tokens",
    requiresReasoningContentOnAssistantMessages: true,
  },
  models: [
    {
      name: "deepseek-v4-flash",
      // Each level and the value the provider takes. `null`: no such level.
      reasoning: { off: "none", minimal: null, medium: null, high: "high", max: "max" },
    },
    { name: "deepseek-chat", reasoning: false },
  ],
});

const stream = chat({
  adapter: deepseek("deepseek-v4-flash"),
  messages: [{ role: "user", content: "Prove that the square root of 2 is irrational." }],
  reasoning: "max",
});
```

- `reasoning` on a model takes a level map, `true` for every level up to `high`, or `false` for a model that does not reason. The `reasoning` option on `chat()` is then typed to those levels.
- `thinkingFormat` picks the request shape: `openai`, `deepseek`, `zai`, `qwen`, `qwen-chat-template`, `chat-template`, `baseten`, `openrouter`, `together`, `string-thinking`, or `ant-ling`.
- `compat` on a model entry overrides the provider's `compat` for that model.
- `requiresReasoningContentOnAssistantMessages` sends the earlier thinking back on each assistant turn, which DeepSeek needs.

The [model catalog](../models/catalog) has the levels and `compat` for many providers, from the same data these fields use.

## Configuration

`openaiCompatible` accepts every OpenAI SDK `ClientOptions` field besides `apiKey`/`baseURL` (which are required and promoted to the top level). The most useful are `defaultHeaders` and `defaultQuery`, for providers that need extra auth or routing parameters:

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

The chat adapters on this page support `wrapFetch`. A middleware can use it to change the HTTP requests of a model call. See [Change the HTTP requests of a call](../advanced/middleware#change-the-http-requests-of-a-call).

## Chat Completions vs Responses

By default the adapter targets the **Chat Completions** API (`/chat/completions`). For providers that implement the **Responses** API, select `api: "responses"`. This API choice also controls how `ChatStreamSummarizeAdapter` forwards `maxLength`, regardless of the wrapper name:

- Chat Completions uses `max_tokens`.
- Responses uses `max_output_tokens`.

An explicit token limit in `modelOptions` takes precedence over `maxLength`.

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

const provider = openaiCompatible({
  baseURL: "https://my-resource.openai.azure.com/openai/v1",
  apiKey: process.env.AZURE_OPENAI_API_KEY!,
  models: ["gpt-5.5"],
  api: "responses", // default is "chat-completions"
});
```

**Reasoning:** Reasoning deltas stream as thinking content. Endpoints frozen on the pre-July-2025 OpenAI spec may still emit the legacy event name `response.reasoning.delta` (removed from the spec in favor of `response.reasoning_text.delta`); the adapter recognizes both and maps them identically.

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
| Mistral | `https://api.mistral.ai/v1` | `mistral-large-latest` |
| Nebius | `https://api.studio.nebius.ai/v1` | `meta-llama/Llama-3.3-70B-Instruct` |
| Z.AI (GLM) | `https://api.z.ai/api/paas/v4` | `glm-4.6` |
| Baseten | `https://inference.baseten.co/v1` | model-dependent |
| Hugging Face (router) | `https://router.huggingface.co/v1` | `meta-llama/Llama-3.3-70B-Instruct` |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `meta/llama-3.3-70b-instruct` |
| Kilo Gateway | `https://api.kilo.ai/api/gateway` | `anthropic/claude-opus-5.5` |
| ZenMux | `https://zenmux.ai/api/v1` | `openai/gpt-5.5` |
| Poe | `https://api.poe.com/v1` | `openai/gpt-5.5` |
| DigitalOcean | `https://inference.do-ai.run/v1` | `openai-gpt-5.5` |
| Modal | `https://inference.us-west.modal.direct/v1` | `moonshotai/Kimi-K3` |
| Snowflake Cortex | `https://<account>.snowflakecomputing.com/api/v2/cortex/v1` | `claude-opus-5` |

Some providers sign the user in with OAuth instead of an API key. For Poe, DigitalOcean, and Snowflake Cortex, pass the access token from your sign-in code as `apiKey`.

On Chat Completions, `RUN_FINISHED.usage` carries the prompt cache counts that the provider reports. Cache reads arrive on `promptTokensDetails.cachedTokens`, and cache writes arrive on `promptTokensDetails.cacheWriteTokens`. Moonshot / Kimi reports both.

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

## LiteLLM Proxy

[LiteLLM](https://github.com/BerriAI/litellm) is a self-hosted gateway that exposes a single OpenAI Chat Completions endpoint in front of 100+ providers (OpenAI, Anthropic, Google, Azure, AWS Bedrock, Mistral, Groq, and more). Because the proxy speaks the OpenAI wire format, it needs no dedicated package — point `openaiCompatible` at your proxy's `baseURL` (default `http://localhost:4000/v1`) and route to a provider with LiteLLM's `provider/model` naming:

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

const litellm = openaiCompatible({
  name: "litellm",
  baseURL: "http://localhost:4000/v1", // your LiteLLM proxy
  apiKey: process.env.LITELLM_API_KEY!, // a virtual key issued by the proxy
  models: [
    "anthropic/claude-sonnet-5",
    "openai/gpt-5.5",
    "gemini/gemini-3.5-flash",
  ],
});
```

`litellm("anthropic/claude-sonnet-5")` selects the Anthropic route; `litellm("openai/gpt-5.5")` selects OpenAI — all through the one proxy. Declare only the model routes you configured on the proxy; for precise per-model capabilities (e.g. a reasoning route without image input), use `createModel` as shown under [Declaring Models](#declaring-models).

> The proxy holds each upstream provider's real credentials; the `apiKey` here is the proxy's own virtual/master key, not the upstream provider's.

## Azure OpenAI

Use `azureOpenaiText` for Azure's Responses API. It configures the `api-key` header, endpoint, API version, and deployment mapping:

```typescript
import { azureOpenaiText } from '@tanstack/ai-openai'

const azure = azureOpenaiText('gpt-5.5', {
  resourceName: 'my-resource',
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  deploymentName: 'production-chat',
})
```

See [Azure OpenAI](./openai#azure-openai) for environment variables and configuration precedence.

## GitHub Copilot

Your users can pay for model calls with their GitHub Copilot plan. Your sign-in code gets a GitHub token for the user. Pass that token as `apiKey`:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiCompatible } from "@tanstack/ai-openai/compatible";
import type { FetchWrapper } from "@tanstack/ai";
import { getCopilotToken } from "./copilot-auth"; // your sign-in code

/** Copilot bills the requests that a user starts. Tool loop requests are "agent". */
const initiator: FetchWrapper = (next) => (input, init) => {
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
  const last = (body.input ?? body.messages ?? []).at(-1);
  const headers = new Headers(init?.headers);
  headers.set("x-initiator", last?.role === "user" ? "user" : "agent");
  return next(input, { ...init, headers });
};

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);
  const copilot = openaiCompatible({
    name: "github-copilot",
    baseURL: "https://api.githubcopilot.com",
    apiKey: await getCopilotToken(request),
    api: "responses",
    models: ["gpt-5.5"],
    defaultHeaders: {
      "Openai-Intent": "conversation-edits",
      "X-GitHub-Api-Version": "2026-08-01",
    },
  });

  const stream = chat({
    adapter: copilot("gpt-5.5"),
    messages: params.messages,
    modelOptions: { store: false, include: ["reasoning.encrypted_content"] },
    wrapFetch: initiator,
  });
  return toServerSentEventsResponse(stream);
}
```

- `baseURL`: use `endpoints.api` from `GET https://api.github.com/copilot_internal/user` when it is set. Business and enterprise accounts get a different host.
- `api`: each entry of `GET {baseURL}/models` lists its `supported_endpoints`. Use `api: "responses"` for a model with `/responses`. Leave out `api` and `modelOptions` for a model with only `/chat/completions`.
- `store: false`: Copilot keeps no responses. With `include`, the stream gives the encrypted reasoning. The adapter sends it back on the next turn when your history keeps it.
- `wrapFetch`: add `Copilot-Vision-Request: true` in the same wrapper when a request has images.

The Chat Completions adapter reads the thinking that Copilot streams on `delta.reasoning_text`.

## ChatGPT plan

A user with a ChatGPT plan can sign in with ChatGPT instead of an API key. The access token works with `createOpenaiChat` on the default OpenAI URL:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { createOpenaiChat } from "@tanstack/ai-openai";
import { getChatGptToken } from "./chatgpt-auth"; // your sign-in code

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);
  const stream = chat({
    adapter: createOpenaiChat("gpt-5.5", await getChatGptToken(request)),
    messages: params.messages,
    modelOptions: { store: false },
  });
  return toServerSentEventsResponse(stream);
}
```

The ChatGPT route requires `store: false`. Do not set `max_output_tokens`. [Sign in with ChatGPT](./openai#sign-in-with-chatgpt-byok) has the browser sign-in helpers and the other limits.

Native compaction does not work with the ChatGPT plan. The plan does not accept `/responses/compact`. Do not pass this adapter as `native` to `withCompaction`. Use a [compaction strategy](../advanced/compaction) instead.

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
