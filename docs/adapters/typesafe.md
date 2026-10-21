---
title: TypeSafe
id: typesafe-adapter
description: "Get typed answers from TypeSafe Jev in TanStack AI with @tanstack/ai-typesafe: a choice, a score, or a yes or no from decide()."
keywords:
  - tanstack ai
  - typesafe
  - jev
  - evaluate
  - decide
  - typed decisions
  - adapter
---

TypeSafe gives you Jev, a model that answers typed questions about your data: a queue name, an urgency level, or a yes or no. The adapter works with `decide()` only. It has no chat.

## 1. Install

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

## 2. Set the API key

Get a key from [TypeSafe](https://typesafe.ai). Put it in the environment of your server:

```bash
TYPESAFE_API_KEY=your-typesafe-api-key
```

`typesafeDecider` reads `TYPESAFE_API_KEY`. To pass the key in code, use `createTypesafeDecider`:

```typescript
import { createTypesafeDecider } from "@tanstack/ai-typesafe";

const adapter = createTypesafeDecider("jev-latest", process.env.MY_TYPESAFE_KEY!);
```

## 3. Ask your first questions from the server

This route reads a support ticket and asks Jev three questions about it:

```typescript
import { decide, choice, score, boolean } from "@tanstack/ai";
import { typesafeDecider } from "@tanstack/ai-typesafe";

export async function POST(request: Request) {
  const ticket = await request.text();

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

  return Response.json({
    queue: result.queue.value,
    urgency: result.urgency.value,
    refund: result.refund.value,
  });
}
```

Each answer also has a `probability`. `result.meta.usage` has the token count.

## 4. Call the route from the client

`decide()` needs your API key, so it stays on the server. The client sends the ticket text to the route:

```typescript
export async function evaluateTicket(ticket: string) {
  const response = await fetch("/api/evaluate", {
    method: "POST",
    body: ticket,
  });
  return response.json();
}
```

Call `evaluateTicket("Charged twice for the same invoice. Please refund the extra payment.")` and you get back something like `{ queue: "billing", urgency: "medium", refund: true }`.

For the question helpers, the result shape, abort, and middleware, see [Evaluate](../evaluate/evaluate). For a full TanStack Start app, see [Evaluate a ticket](../tutorials/evaluate).

## Models and options

| Model | Description |
| --- | --- |
| `jev-latest` | The current stable Jev release |
| `jev-1.13.0` | A pinned Jev release |

You can also pass other TypeSafe model ids as a string. The package exports the known ids as `TYPESAFE_EVALUATE_MODELS`.

## Advanced

### Behind a proxy

To send every request through a gateway, set `baseURL` and `defaultHeaders`. All TanStack AI adapters use these two option names:

```typescript
import { createTypesafeDecider } from "@tanstack/ai-typesafe";

const adapter = createTypesafeDecider("jev-latest", process.env.TYPESAFE_API_KEY!, {
  baseURL: "https://gateway.example.com/typesafe",
  defaultHeaders: {
    "cf-aig-authorization": `Bearer ${process.env.GATEWAY_TOKEN}`,
  },
});
```

`baseUrl` and `headers` are aliases of the same two options. If you set both forms, `baseURL` and `defaultHeaders` win.

### Bring your own key

`typesafeByok` from `@tanstack/ai-typesafe/byok` declares TypeSafe for the BYOK store, with `TYPESAFE_API_KEY` as its env var. See [Bring Your Own Key](../advanced/byok).

### API reference

The adapter sends `POST /v1/systemone` to the base URL with `fetch`. There is no TypeSafe SDK.

| Factory | Creates |
| --- | --- |
| `typesafeDecider(model, config?)` | An evaluate adapter. Reads `TYPESAFE_API_KEY`. |
| `createTypesafeDecider(model, apiKey, config?)` | The same adapter with an explicit API key. |

The `config` fields:

- `baseURL`: the API base URL. The default is `https://api.typesafe.ai`. `baseUrl` is an alias.
- `defaultHeaders`: extra request headers. `headers` is an alias.
- `fetch`: your own `fetch` function.
