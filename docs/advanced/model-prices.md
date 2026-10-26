---
title: Model Prices
id: model-prices
description: "Price each model call from its token usage, with live rate cards from modelschemas."
keywords:
  - tanstack ai
  - model prices
  - token cost
  - modelschemas
  - rate card
  - onUsage
---

Get a model's rate card from [modelschemas](https://modelschemas.com) with `@modelschemas/client`. Check it with `rateCardSchema`, then price each call with `evaluateCard` from `@modelschemas/rate-card`. Prices change often, so read them live. Do not copy them into your code.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @modelschemas/client @modelschemas/rate-card zod
vue: @modelschemas/client @modelschemas/rate-card zod
solid: @modelschemas/client @modelschemas/rate-card zod
svelte: @modelschemas/client @modelschemas/rate-card zod
preact: @modelschemas/client @modelschemas/rate-card zod
angular: @modelschemas/client @modelschemas/rate-card zod
octane: @modelschemas/client @modelschemas/rate-card zod
vanilla: @modelschemas/client @modelschemas/rate-card zod

<!-- ::end:tabs -->

## Price a chat call

Price each call in the [`onUsage`](./middleware-advanced#onusage) hook of a middleware, on the server:

```typescript
import { chat } from "@tanstack/ai";
import type { ChatMiddleware, TokenUsage } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { createModelschemasClient, getModel } from "@modelschemas/client";
import { RateCardError, evaluateCard } from "@modelschemas/rate-card/evaluator";
import type { RateCard } from "@modelschemas/rate-card/evaluator";
import { rateCardSchema } from "@modelschemas/rate-card/schema";

const client = createModelschemasClient({ baseUrl: "https://modelschemas.com" });

// Keep each rate card for one hour.
const cards = new Map<string, { at: number; card: Promise<RateCard | undefined> }>();

function rateCard(provider: string, modelId: string) {
  const key = `${provider}/${modelId}`;
  const hit = cards.get(key);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.card;
  // A model with no rate card, or only a price summary, fails the check.
  const card = getModel({ client, path: { provider, modelId } }).then(({ data }) => {
    const parsed = rateCardSchema.safeParse(data?.pricing);
    return parsed.success ? parsed.data : undefined;
  });
  cards.set(key, { at: Date.now(), card });
  return card;
}

// A rate card counts each kind of input token once. `promptTokens` holds them all.
function cardUsage(usage: TokenUsage) {
  const cached = usage.promptTokensDetails?.cachedTokens ?? 0;
  const written = usage.promptTokensDetails?.cacheWriteTokens ?? 0;
  const written1h = usage.promptTokensDetails?.cacheWrite1hTokens ?? 0;
  const cacheCounts = {
    cache_read_tokens: cached,
    cache_write_tokens: written - written1h,
    cache_write_1h_tokens: written1h,
  };
  return {
    input_tokens: usage.promptTokens - cached - written,
    output_tokens: usage.completionTokens,
    // A card without a cache price rejects a cache count, even a 0.
    ...Object.fromEntries(Object.entries(cacheCounts).filter(([, count]) => count > 0)),
  };
}

const costLog: ChatMiddleware = {
  name: "cost-log",
  onUsage: async (ctx, usage) => {
    const card = await rateCard("anthropic", ctx.model);
    if (!card) return console.log(`${ctx.model}: no price on modelschemas`);
    try {
      const { amount, currency } = evaluateCard(card, { usage: cardUsage(usage) });
      const price = new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 6 });
      console.log(`${ctx.model}: ${price.format(amount)}`);
    } catch (error) {
      if (!(error instanceof RateCardError)) throw error;
      console.log(`${ctx.model}: price not known (${error.message})`);
    }
  },
};

const stream = chat({
  adapter: anthropicText("claude-sonnet-5-5"),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
  middleware: [costLog],
});
```

The log shows the cost of each model call, for example `claude-sonnet-5-5: $0.013`. A card uses long-context tiers when the input is long enough.

## When the price is not known

The rate card does not guess:

- `rateCardSchema.safeParse` fails when modelschemas has no rate card for the model.
- `evaluateCard` throws `RateCardError` when the call used tokens that the card has no price for.
- `currency` is the card's own currency, for example `USD` or `CNY`. Do not add amounts in two currencies.

modelschemas allows 60 calls an hour without a key. With the one-hour cache above, that is one call for each model. For a higher limit, pass `apiKey` to `createModelschemasClient`.

## Price an image before you make it

A media card prices the request, so you can show the cost before you call the model:

```typescript
import { createModelschemasClient, getModel } from "@modelschemas/client";
import { evaluateCard } from "@modelschemas/rate-card/evaluator";
import { rateCardSchema } from "@modelschemas/rate-card/schema";

const client = createModelschemasClient({ baseUrl: "https://modelschemas.com" });

const { data } = await getModel({
  client,
  path: { provider: "fal", modelId: "alibaba/qwen-image-3/edit" },
});
const parsed = rateCardSchema.safeParse(data?.pricing);
if (parsed.success) {
  const { amount, currency } = evaluateCard(parsed.data, {
    request: { num_images: 2 },
  });
  console.log(`Two images cost ${amount} ${currency}`);
}
```

## Provider ids

Pass the modelschemas provider id, not the package name:

| Package | modelschemas provider |
| --- | --- |
| `@tanstack/ai-anthropic` | `anthropic` |
| `@tanstack/ai-openai` | `openai`, or `azure` for Azure OpenAI |
| `@tanstack/ai-gemini` | `gemini` |
| `@tanstack/ai-vertex` | `google-vertex` |
| `@tanstack/ai-grok` | `grok` |
| `@tanstack/ai-groq` | `groq` |
| `@tanstack/ai-mistral` | `mistral` |
| `@tanstack/ai-bedrock` | `amazon-bedrock` |
| `@tanstack/ai-openrouter` | `openrouter` |
| `@tanstack/ai-vercel-gateway` | `vercel` |
| `@tanstack/ai-cloudflare` | `cloudflare-workers-ai` |
| `@tanstack/ai-fal` | `fal` |
