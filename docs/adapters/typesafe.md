---
title: TypeSafe
id: typesafe-adapter
description: "Use TypeSafe Jev with TanStack AI via @tanstack/ai-typesafe: typed evaluate decisions with decide(), choice(), score(), and boolean()."
keywords:
  - tanstack ai
  - typesafe
  - jev
  - evaluate
  - decide
  - typed decisions
  - adapter
---

You have a TypeSafe API key and you want typed answers from Jev.
Install `@tanstack/ai-typesafe`. Then pass `typesafeDecider` to `decide()`.

The adapter covers evaluate only. It talks to TypeSafe over `fetch`. There is no TypeSafe SDK.

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-typesafe
vue: @tanstack/ai @tanstack/ai-typesafe
solid: @tanstack/ai @tanstack/ai-typesafe
svelte: @tanstack/ai @tanstack/ai-typesafe
preact: @tanstack/ai @tanstack/ai-typesafe
angular: @tanstack/ai @tanstack/ai-typesafe
vanilla: @tanstack/ai @tanstack/ai-typesafe
octane: @tanstack/ai @tanstack/ai-typesafe

<!-- ::end:tabs -->

## Evaluate

```typescript
import { decide, choice, score, boolean } from "@tanstack/ai";
import { typesafeDecider } from "@tanstack/ai-typesafe";

const ticket = {
  subject: "Charged twice for the same invoice",
  body: "Please refund the extra payment.",
};

const result = await decide({
  adapter: typesafeDecider("jev-latest"),
  state: ticket,
  questions: {
    queue: choice({
      instructions: "Which team should handle this ticket?",
      options: {
        billing: "Payments, invoices, refunds",
        tech: "Bugs, outages, integrations",
        sales: "Pricing, upgrades, new accounts",
      },
    }),
    urgency: score({
      instructions: "How urgent is this ticket?",
      levels: ["low", "medium", "high"],
    }),
    refund: boolean({
      instructions: "Is the customer asking for a refund?",
    }),
  },
});

console.log(result.queue.value);
console.log(result.queue.probability);
console.log(result.queue.confidence);
console.log(result.meta.usage);
```

For question helpers, the result shape, abort, and middleware, see [Evaluate](../evaluate/evaluate).

## Models

| Model        | Description                |
| ------------ | -------------------------- |
| `jev-latest` | Current stable Jev alias   |
| `jev-1.13.0` | Pinned Jev release         |

You can also pass other TypeSafe model ids as a string.

## Environment Variables

The adapter reads your API key from the environment:

```bash
TYPESAFE_API_KEY=your-typesafe-api-key
```

| Variable           | Required | Description            |
| ------------------ | -------- | ---------------------- |
| `TYPESAFE_API_KEY` | Yes      | Your TypeSafe API key  |

Get a key from [TypeSafe](https://typesafe.ai).

## Explicit API Keys

To pass a key directly, use `createTypesafeDecider`:

```typescript
import { createTypesafeDecider } from "@tanstack/ai-typesafe";

const adapter = createTypesafeDecider(
  "jev-latest",
  process.env.MY_TYPESAFE_KEY!,
);
```

## Behind a proxy

Route every request through a gateway with `baseURL` and `defaultHeaders`.
These two option names are the same on every TanStack AI adapter.

```typescript
import { createTypesafeDecider } from "@tanstack/ai-typesafe";

const adapter = createTypesafeDecider(
  "jev-latest",
  process.env.TYPESAFE_API_KEY!,
  {
    baseURL: "https://gateway.example.com/typesafe",
    defaultHeaders: {
      "cf-aig-authorization": `Bearer ${process.env.GATEWAY_TOKEN}`,
    },
  },
);
```

`baseUrl` and `headers` are aliases of the same two options. If you set both forms, `baseURL` and `defaultHeaders` win.

## API Reference

### `typesafeDecider(model, config?)`

Creates an evaluate adapter. It reads `TYPESAFE_API_KEY` from the environment.

- `model`: `"jev-latest"`, `"jev-1.13.0"`, or another TypeSafe model id
- `config.baseURL`: override the API base URL (default `https://api.typesafe.ai`). `baseUrl` is an alias.
- `config.defaultHeaders`: extra request headers. `headers` is an alias.
- `config.fetch`: override `fetch`
- `config.timeout`: request timeout in milliseconds

### `createTypesafeDecider(model, apiKey, config?)`

Same as `typesafeDecider` with an explicit API key.

The adapter sends `POST /v1/systemone` to that base URL.

## Next Steps

- [Evaluate guide](../evaluate/evaluate): full `decide()` walkthrough
- [Evaluate a ticket](../tutorials/evaluate): build a Start route
- [Generation Hooks](../media/generation-hooks.md): usage and lifecycle middleware
