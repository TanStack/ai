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

## Work out what a call cost

Prices are in USD per million tokens. `modelCost` turns token counts into a cost:

```typescript
import { getModel, modelCost } from "@tanstack/ai-models";

const model = getModel("openai", "gpt-5.5");
if (model) {
  const cost = modelCost(model, { input: 12_000, output: 800 });
  console.log(cost.total.toFixed(4));
}
```

## Load one provider only

The root import has every provider. To load only one, import its subpath:

```typescript
import { models, provider } from "@tanstack/ai-models/deepseek";

console.log(provider.baseUrl, models.length);
```

## Keep it up to date

The catalog is generated from [models.dev](https://models.dev) and the OpenRouter and Vercel AI Gateway model lists. `generatedAt` is the time of the last update. A record with `borrowedFrom` took its data from the same model at another provider.
