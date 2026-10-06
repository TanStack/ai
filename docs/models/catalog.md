---
title: Model Catalog
id: catalog
description: "Look up models, reasoning levels, prices, and provider quirks at runtime with @tanstack/ai-models."
keywords:
  - tanstack ai
  - model catalog
  - models.dev
  - model metadata
  - reasoning levels
  - model pricing
---

A model picker, a cost display, or a settings menu needs facts about models at runtime: which models a provider has, which reasoning levels a model takes, and what a call costs. `@tanstack/ai-models` is a catalog of that data for more than 1,900 models across 38 providers.

## Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-models
vue: @tanstack/ai-models
solid: @tanstack/ai-models
svelte: @tanstack/ai-models
preact: @tanstack/ai-models
angular: @tanstack/ai-models
vanilla: @tanstack/ai-models
octane: @tanstack/ai-models

<!-- ::end:tabs -->

## Look up a model

```typescript
import { getModel, getModels, getProviders } from "@tanstack/ai-models";

const providers = getProviders(); // every provider: id, name, baseUrl, env
const deepseekModels = getModels("deepseek"); // every DeepSeek model
const model = getModel("deepseek", "deepseek-v4-flash");

console.log(model?.contextWindow, model?.maxTokens, model?.input);
```

Each record has the model's `id`, `name`, `input` modalities, `contextWindow`, `maxTokens`, prices, and reasoning data. `getModel` returns `undefined` for a model the catalog does not have.

## Show the reasoning levels

`supportedReasoningLevels` gives the levels a model takes. Use it to fill a menu:

```typescript
import { getModel, supportedReasoningLevels } from "@tanstack/ai-models";

const model = getModel("deepseek", "deepseek-v4-flash");
const levels = model ? supportedReasoningLevels(model) : [];
// ["off", "low", "high", "max"]
```

`clampReasoningLevel(model, level)` gives the level an adapter uses for a level the model does not have. Pass the level to [`chat({ reasoning })`](../chat/reasoning).

## Build an adapter from a record

A record says which wire API the model uses (`api`) and how it reasons. Many catalog ids, such as gateway ids, are not in the adapter's own model list. Pass `modelReasoning(record)` as the `reasoning` config, so the adapter sends the model's thinking fields:

```typescript
import { chat } from "@tanstack/ai";
import { createAnthropicChat } from "@tanstack/ai-anthropic";
import { getModel, modelReasoning } from "@tanstack/ai-models";

const record = getModel("vercel-ai-gateway", "anthropic/claude-sonnet-4.6");
if (record) {
  const adapter = createAnthropicChat(
    record.id,
    process.env.AI_GATEWAY_API_KEY ?? "",
    { baseURL: record.baseUrl, reasoning: modelReasoning(record) },
  );
  const stream = chat({
    adapter,
    messages: [{ role: "user", content: "Hello" }],
    reasoning: "high",
  });
}
```

Pick the adapter from the record's `api`:

| `api` | Adapter |
| --- | --- |
| `anthropic-messages` | `createAnthropicChat` from `@tanstack/ai-anthropic` |
| `openai-responses` | `createOpenaiChat` from `@tanstack/ai-openai` |
| `azure-openai-responses` | `azureOpenaiText` from `@tanstack/ai-openai` |
| `google-generative-ai`, `google-vertex` | `createGeminiChat` from `@tanstack/ai-gemini`, with `vertexai: true` for Vertex |
| `bedrock-converse-stream` | `createBedrockConverse` from `@tanstack/ai-bedrock` |
| `mistral-conversations` | `createMistralText` from `@tanstack/ai-mistral` |
| `openai-completions` | `openaiCompatible` from `@tanstack/ai-openai`, see [OpenAI-Compatible](../adapters/openai-compatible) |

The catalog has no Claude models under `google-vertex`, because Claude on Vertex uses the Anthropic wire. Use `anthropicVertexText` from `@tanstack/ai-anthropic/vertex` for them.

## Work out what a call cost

Prices are in USD per million tokens. `modelCost` turns token counts into a cost. `input` is the uncached input:

```typescript
import { getModel, modelCost } from "@tanstack/ai-models";

const model = getModel("openai", "gpt-5.5");
if (model) {
  const cost = modelCost(model, { input: 12_000, output: 800 });
  console.log(cost.total.toFixed(4));
}
```

`modelCost` also follows two price rules:

- **Long context.** Some models cost more above an input size. The record lists these prices in `cost.tiers`. A call uses the tier with the highest `inputTokensAbove` below its input (uncached, plus cache reads, plus cache writes).
- **1-hour cache writes.** `cacheWrite1h` is the part of `cacheWrite` that was written with a 1-hour retention. It costs 2 times the input price.

To price each call of a chat, read its usage in middleware. Anthropic and Bedrock report the 1-hour part as `promptTokensDetails.cacheWrite1hTokens`:

```typescript
import type { ChatMiddleware } from "@tanstack/ai";
import { getModel, modelCost } from "@tanstack/ai-models";

const model = getModel("anthropic", "claude-sonnet-4-5-20250929");

const logCost: ChatMiddleware = {
  name: "log-cost",
  onUsage(_ctx, usage) {
    if (!model) return;
    const details = usage.promptTokensDetails;
    const cacheRead = details?.cachedTokens ?? 0;
    const cacheWrite = details?.cacheWriteTokens ?? 0;
    const cost = modelCost(model, {
      input: usage.promptTokens - cacheRead - cacheWrite,
      output: usage.completionTokens,
      cacheRead,
      cacheWrite,
      cacheWrite1h: details?.cacheWrite1hTokens ?? 0,
    });
    console.log(cost.total.toFixed(4));
  },
};
```

## Load one provider only

The root import has every provider. To load only one, import its subpath:

```typescript
import { models, provider } from "@tanstack/ai-models/deepseek";

console.log(provider.baseUrl, models.length);
```

## Keep it up to date

The catalog is generated from [models.dev](https://models.dev) and the OpenRouter and Vercel AI Gateway model lists. `generatedAt` is the time of the last update. A record with `borrowedFrom` took its data from the same model at another provider.
