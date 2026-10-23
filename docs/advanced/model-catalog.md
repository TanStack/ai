---
title: Model Catalog
id: model-catalog
description: "List a provider's models with their context windows, prices, and reasoning levels, and price each run with modelCost."
keywords:
  - tanstack ai
  - model catalog
  - model prices
  - context window
  - reasoning levels
  - modelCost
---

Import `models` from the `./models` subpath of a provider package. Each record gives the model id, the context window, the prices, and the reasoning levels.

```typescript
import { models } from "@tanstack/ai-anthropic/models";

const model = models.find((m) => m.id === "claude-sonnet-5-5");
console.log(model?.contextWindow, model?.prices?.input);
```

## Packages with a catalog

| Provider | Import from |
| --- | --- |
| Anthropic | `@tanstack/ai-anthropic/models` |
| OpenAI | `@tanstack/ai-openai/models` |
| Azure OpenAI | `@tanstack/ai-openai/azure-models` |
| Gemini | `@tanstack/ai-gemini/models` |
| Vertex AI | `@tanstack/ai-vertex/models` |
| Amazon Bedrock | `@tanstack/ai-bedrock/models` |
| Groq | `@tanstack/ai-groq/models` |
| Mistral | `@tanstack/ai-mistral/models` |
| xAI | `@tanstack/ai-grok/models` |
| OpenRouter | `@tanstack/ai-openrouter/models` |
| Vercel AI Gateway | `@tanstack/ai-vercel-gateway/models` |
| Cloudflare Workers AI | `@tanstack/ai-cloudflare/models` |
| Cloudflare AI Gateway | `@tanstack/ai-cloudflare/gateway-models` |

The data comes from [modelschemas](https://modelschemas.com). A daily job syncs it, and a patch release ships each change.

## Fill a model picker

The catalog is plain data, so you can import it in the browser. `supportedReasoningLevels` gives the levels that a model takes:

```tsx
import { useState } from "react";
import { supportedReasoningLevels } from "@tanstack/ai";
import { models } from "@tanstack/ai-openai/models";

export function ModelPicker() {
  const [id, setId] = useState("gpt-6.1-sol");
  const model = models.find((m) => m.id === id);

  return (
    <>
      <select value={id} onChange={(event) => setId(event.target.value)}>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <select>
        {supportedReasoningLevels(model?.reasoning).map((level) => (
          <option key={level}>{level}</option>
        ))}
      </select>
    </>
  );
}
```

To pick a level that the model does not have, use `clampReasoningLevel`. It returns the nearest level that the model supports. See [Reasoning](../chat/reasoning).

## Price a run

`modelCost` gives the cost of one model call from its token usage. Call it in the [`onUsage`](./middleware-advanced#onusage) hook of a middleware:

```typescript
import { chat, modelCost } from "@tanstack/ai";
import type { ChatMiddleware } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { models } from "@tanstack/ai-anthropic/models";

const costLog: ChatMiddleware = {
  name: "cost-log",
  onUsage: (ctx, usage) => {
    const model = models.find((m) => m.id === ctx.model);
    const cost = model ? modelCost(model, usage) : undefined;
    console.log(cost ? `${cost.total} ${cost.currency}` : "Price not known");
  },
};

const stream = chat({
  adapter: anthropicText("claude-sonnet-5-5"),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
  middleware: [costLog],
});
```

`modelCost` uses the long-context prices when the input is more than a tier's `inputTokensAbove`. It prices cache reads, cache writes, and 1-hour cache writes at their own rates.

## Values that are not known

The catalog does not guess. When the source does not list a value, the record does not have it:

- `prices`, `contextWindow`, `maxOutputTokens`, `input`: `undefined`.
- One rate in `prices`, for example `cacheWrite`: `undefined`. That rate is not known, and it is not free.
- `modelCost`: `undefined` when the call used tokens that have no known price.
- `reasoning.levels`: empty when the source lists no levels. A model with `budget: true` takes `budgetTokens`. See [Reasoning](../chat/reasoning).

Prices are in `prices.currency`, for example `USD` or `CNY`.
