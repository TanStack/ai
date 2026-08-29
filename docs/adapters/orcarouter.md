---
title: OrcaRouter
id: orcarouter-adapter
description: "Route chat, tool calling, and structured outputs across many models with adaptive routing, automatic failover, zero-markup inference, observability, guardrails, and agent-tool governance through OrcaRouter's single OpenAI-compatible endpoint in TanStack AI."
keywords:
  - tanstack ai
  - orcarouter
  - ai gateway
  - multi-provider
  - unified api
  - model router
  - agent governance
  - adapter
---

[OrcaRouter](https://www.orcarouter.ai) is an OpenAI-compatible AI gateway built for both models and agents. Like OpenRouter, it exposes a provider/model namespace across many models — but it also combines adaptive routing, automatic failover, zero-markup inference, observability, guardrails, and agent-tool governance behind the same endpoint. Use the hosted gateway at `api.orcarouter.ai` or point the adapter at your own deployment.

## Installation

```bash
npm install @tanstack/ai-orcarouter
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { orcaRouterText } from "@tanstack/ai-orcarouter";

const stream = chat({
  adapter: orcaRouterText("openai/gpt-5.5-pro"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

`orcaRouterText` reads your API key from the `ORCAROUTER_API_KEY` environment variable. Use `createOrcaRouterText` to pass it explicitly.

## Configuration

```typescript
import { createOrcaRouterText } from "@tanstack/ai-orcarouter";

const adapter = createOrcaRouterText(
  "openai/gpt-5.5-pro",
  process.env.ORCAROUTER_API_KEY!,
  {
    baseURL: "https://api.orcarouter.ai/v1", // Optional — set for self-hosted deployments
  },
);
```

OrcaRouter is self-hostable; point `baseURL` at your own deployment to keep the same adapter surface.

## Available Models

Any model listed at [orcarouter.ai/models](https://www.orcarouter.ai) works — pass its id as the model name. Model ids use the `provider/model` prefix to pin routing to a specific provider, and the `orcarouter/fusion` family enables adaptive automatic routing across fallback models:

```text
model: "orcarouter/fusion"               // adaptive routing across fallback models
model: "openai/gpt-5.5-pro"              // always routed to OpenAI
model: "anthropic/claude-opus-4.8"       // always routed to Anthropic
model: "deepseek/deepseek-v4-pro-0813"   // always routed to DeepSeek
```

A curated set of flagship models (see `ORCAROUTER_CHAT_MODELS`) additionally carries per-model type metadata — input modalities and provider options — with editor autocomplete. Uncurated ids still work and fall back to text-only input with the generic options.

## Example: Chat Completion

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { orcaRouterText } from "@tanstack/ai-orcarouter";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: orcaRouterText("openai/gpt-5.5-pro"),
    messages,
  });

  return toServerSentEventsResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toServerSentEventsResponse, toolDefinition } from "@tanstack/ai";
import { orcaRouterText } from "@tanstack/ai-orcarouter";
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
    adapter: orcaRouterText("openai/gpt-5.5-pro"),
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
import { orcaRouterText } from "@tanstack/ai-orcarouter";

const stream = chat({
  adapter: orcaRouterText("deepseek/deepseek-v4-pro-0813"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    temperature: 0.7,
    max_completion_tokens: 4096,
    reasoning_effort: "high",
  },
});
```

`reasoning_effort` accepts the extended scale `none` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max` in addition to OpenAI's standard tiers — which tiers a model honors depends on the model and provider it is routed to.

Reasoning models stream their thinking as `reasoning_content` deltas, which the adapter surfaces as AG-UI `REASONING_*` events.

## Summarization

```typescript
import { summarize } from "@tanstack/ai";
import { orcaRouterSummarize } from "@tanstack/ai-orcarouter";

const result = await summarize({
  adapter: orcaRouterSummarize("openai/gpt-5.5-pro"),
  text: "Long article text...",
  stream: false,
});

console.log(result.summary);
```

## Gateway Security

OrcaRouter also runs gateway-level, zero-trust security for AI agents on the same endpoint — screening every prompt/response and governing every tool call on a default-deny basis, with no application code changes.

## Environment Variables

Set your API key in environment variables:

```bash
ORCAROUTER_API_KEY=sk-orca_your-api-key
```

Get an API key from the [OrcaRouter dashboard](https://www.orcarouter.ai).
