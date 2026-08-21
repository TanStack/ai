---
title: LLM Gateway
id: llmgateway-adapter
description: "Route chat, tool calling, and structured outputs to hundreds of LLMs from OpenAI, Anthropic, Google, Moonshot, DeepSeek, and more through LLM Gateway's single OpenAI-compatible endpoint in TanStack AI."
keywords:
  - tanstack ai
  - llm gateway
  - llmgateway
  - multi-provider
  - unified api
  - model router
  - self-hosted
  - adapter
---

[LLM Gateway](https://llmgateway.io) is an open-source AI gateway that routes one OpenAI-compatible endpoint to hundreds of models across many providers — with automatic provider selection, fallback, usage analytics, and cost tracking. Use the hosted gateway at `api.llmgateway.io` or point the adapter at your own self-hosted deployment.

## Installation

```bash
npm install @tanstack/ai-llmgateway
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { llmGatewayText } from "@tanstack/ai-llmgateway";

const stream = chat({
  adapter: llmGatewayText("gpt-5.6-terra"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

`llmGatewayText` reads your API key from the `LLM_GATEWAY_API_KEY` environment variable. Use `createLLMGatewayText` to pass it explicitly.

## Configuration

```typescript
import { createLLMGatewayText } from "@tanstack/ai-llmgateway";

const adapter = createLLMGatewayText(
  "gpt-5.6-terra",
  process.env.LLM_GATEWAY_API_KEY!,
  {
    baseURL: "https://api.llmgateway.io/v1", // Optional — set for self-hosted deployments
  },
);
```

LLM Gateway is open source and self-hostable; point `baseURL` at your own deployment to keep the same adapter surface.

## Available Models

Any model listed at [llmgateway.io/models](https://llmgateway.io/models) works — pass its id as the model name. A bare model id lets the gateway route to the best available provider; prefix it with `provider/` to pin routing to a specific provider:

```text
model: "gpt-5.6-terra"          // gateway picks the provider
model: "claude-sonnet-5"        // gateway picks the provider
model: "moonshot/kimi-k3"       // always routed to Moonshot
model: "fireworks/kimi-k3"      // always routed to Fireworks
```

A curated set of flagship models (see `LLMGATEWAY_CHAT_MODELS`) additionally carries per-model type metadata — input modalities and provider options — with editor autocomplete. Uncurated ids still work and fall back to text-only input with the generic options.

## Example: Chat Completion

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { llmGatewayText } from "@tanstack/ai-llmgateway";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: llmGatewayText("gpt-5.6-terra"),
    messages,
  });

  return toServerSentEventsResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toServerSentEventsResponse, toolDefinition } from "@tanstack/ai";
import { llmGatewayText } from "@tanstack/ai-llmgateway";
import { z } from "zod";

const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get the current weather",
  inputSchema: z.object({
    location: z.string(),
  }),
});

const getWeather = getWeatherDef.server(async ({ location }) => {
  return { temperature: 72, conditions: "sunny" };
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: llmGatewayText("gpt-5.6-terra"),
    messages,
    tools: [getWeather],
  });

  return toServerSentEventsResponse(stream);
}
```

## Model Options

The gateway accepts the standard Chat Completions parameters and forwards them to the routed provider (parameters a provider doesn't support are stripped server-side). Sampling parameters live in `modelOptions`:

```typescript
import { chat } from "@tanstack/ai";
import { llmGatewayText } from "@tanstack/ai-llmgateway";

const stream = chat({
  adapter: llmGatewayText("kimi-k3"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    temperature: 0.7,
    max_completion_tokens: 4096,
    reasoning_effort: "high",
  },
});
```

`reasoning_effort` accepts the extended scale `none` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max` in addition to OpenAI's standard tiers — which tiers a model honors depends on the model and provider it is routed to (see the model's page on [llmgateway.io/models](https://llmgateway.io/models)).

Reasoning models stream their thinking as `reasoning_content` deltas, which the adapter surfaces as AG-UI `REASONING_*` events.

## Summarization

```typescript
import { summarize } from "@tanstack/ai";
import { llmGatewaySummarize } from "@tanstack/ai-llmgateway";

const result = await summarize({
  adapter: llmGatewaySummarize("gpt-5.4-mini"),
  text: "Long article text...",
  stream: false,
});

console.log(result.summary);
```

## Environment Variables

Set your API key in environment variables:

```bash
LLM_GATEWAY_API_KEY=llmgtwy_your-api-key
```

Get an API key from the [LLM Gateway dashboard](https://llmgateway.io).
