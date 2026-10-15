---
title: Model Catalog
id: catalog
description: "Look up models, reasoning levels, prices, and context windows at runtime with @tanstack/ai-models."
keywords:
  - tanstack ai
  - model catalog
  - models.dev
  - model metadata
  - reasoning levels
  - model pricing
---

A model picker, a cost display, or a settings menu needs facts about models at runtime: which models a provider has, which reasoning levels a model takes, and what a call costs. `@tanstack/ai-models` is a catalog of that data for more than 1,800 models across 38 providers.

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

The `google-vertex` provider has the Gemini models only. For Claude on Vertex, use `anthropicVertexText` from `@tanstack/ai-anthropic/vertex`.

## Show the reasoning levels

`supportedReasoningLevels` gives the levels a model takes. Use it to fill a menu:

```typescript
import { getModel, supportedReasoningLevels } from "@tanstack/ai-models";

const model = getModel("deepseek", "deepseek-v4-flash");
const levels = model ? supportedReasoningLevels(model) : [];
// ["off", "low", "high", "max"]
```

`clampReasoningLevel(model, level)` gives the nearest level the model has, for a level it does not have. Pass the level to [`chat({ reasoning })`](../chat/reasoning).

A record's `reasoning` is `false` for a model that does not reason. Otherwise it has two fields:

- `levels`: the provider value to send for each level the model has.
- `budget`: `true` when the model takes a thinking token budget.

This is the same shape as `ModelReasoning` in `@tanstack/ai`.

## Work out what a call cost

Prices are in USD per million tokens. `modelCost` turns token counts into a cost. `input` is the uncached input:

```typescript
import { getModel, modelCost } from "@tanstack/ai-models";

const model = getModel("openai", "gpt-5.6");
if (model) {
  const cost = modelCost(model, { input: 12_000, output: 800 });
  console.log(cost.total.toFixed(4));
}
```

`modelCost` also uses two price rules:

- **Long context.** Some models cost more above an input size. The record lists these prices in `cost.tiers`. A call uses the tier with the highest `inputTokensAbove` below its input (uncached, plus cache reads, plus cache writes).
- **1-hour cache writes.** `cacheWrite1h` is the part of `cacheWrite` that has a 1-hour retention. It costs 2 times the input price.

To price each call of a chat, read its usage in middleware:

```typescript
import type { ChatMiddleware } from "@tanstack/ai";
import { getModel, modelCost } from "@tanstack/ai-models";

const model = getModel("anthropic", "claude-sonnet-5-5");

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

The catalog comes from [models.dev](https://models.dev) and the OpenRouter and Vercel AI Gateway model lists. `generatedAt` is the date of the last update. A record with `borrowedFrom` took its data from the same model at another provider.
