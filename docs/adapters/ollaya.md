---
title: Ollaya
id: ollaya-adapter
description: "Run decide() on a local Ollaya server with @tanstack/ai-ollaya. Typed answers about your data, with no API key, and the data stays on your machine."
keywords:
  - tanstack ai
  - ollaya
  - laya
  - evaluate
  - decide
  - typed decisions
  - adapter
---

The Ollaya adapter calls the `laya` models on your machine through `decide()`. It returns a typed answer. It has no chat.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-ollaya
vue: @tanstack/ai @tanstack/ai-ollaya
solid: @tanstack/ai @tanstack/ai-ollaya
svelte: @tanstack/ai @tanstack/ai-ollaya
preact: @tanstack/ai @tanstack/ai-ollaya
angular: @tanstack/ai @tanstack/ai-ollaya
vanilla: @tanstack/ai @tanstack/ai-ollaya
octane: @tanstack/ai @tanstack/ai-ollaya

<!-- ::end:tabs -->

## 2. Start Ollaya and pull a model

Ollaya needs no API key. It needs a running server with a model.

1. Install Ollaya:

```bash
# macOS or Linux
curl -fsSL https://ollaya.dev/install.sh | sh
```

```powershell
# Windows (PowerShell)
irm https://ollaya.dev/install.ps1 | iex
```

2. Start the server:

```bash
ollaya serve
```

3. Pull a model:

```bash
ollaya pull laya:latest
```

The server listens on `http://127.0.0.1:11435`. The adapter uses this URL by default. The download page and the desktop app are on [ollaya.dev/download](https://ollaya.dev/download).

## 3. Ask your first questions from the server

This route reads a support ticket and asks three questions about it:

```typescript
import { decide, choice, score, boolean } from "@tanstack/ai";
import { ollayaDecider } from "@tanstack/ai-ollaya";

export async function POST(request: Request) {
  const ticket = await request.text();

  const result = await decide({
    adapter: ollayaDecider("laya:latest"),
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
    model: result.meta.model,
  });
}
```

When you ask for `laya:latest`, the server picks `laya:en` or `laya:multilingual` from the text. `result.meta.model` tells you which one answered.

## 4. Call the route from the client

The client sends the ticket text to the route:

```typescript
export async function evaluateTicket(ticket: string) {
  const response = await fetch("/api/evaluate", {
    method: "POST",
    body: ticket,
  });
  return response.json();
}
```

Call `evaluateTicket("Charged twice for the same invoice. Please refund the extra payment.")` and you get back the queue, the urgency, and the refund answer.

For the rest of `decide()`, see [Evaluate](../evaluate/evaluate). For a full TanStack Start app, see [Evaluate a ticket](../tutorials/evaluate).

## Models and options

| Model | Description |
| --- | --- |
| `laya:latest` | Sends each request to `laya:en` or `laya:multilingual`. |
| `laya:en` | The English decision model (ModernBERT-large). |
| `laya:multilingual` | The decision model for 100+ languages (mmBERT-base). |

You can pass any other model tag as a string. The package exports the known tags as `OLLAYA_EVALUATE_MODELS`.

## Advanced

### Another host, or an API key

The adapter does not read environment variables.

- If the server is on another host, pass `baseURL`.
- If the server requires `OLLAYA_API_KEY`, pass the key as `apiKey`.

```typescript
import { ollayaDecider } from "@tanstack/ai-ollaya";

const adapter = ollayaDecider("laya:latest", {
  baseURL: "http://my-host:11435",
  apiKey: "local-token",
});
```

`baseUrl` and `headers` are aliases of `baseURL` and `defaultHeaders`. If you set both forms, `baseURL` and `defaultHeaders` win. A blank `baseURL` keeps the default host.

### API reference

The adapter sends `POST /v1/systemone` to the base URL with `fetch`. There is no Ollaya SDK.

`ollayaDecider(model, config?)` creates an evaluate adapter. The `config` fields:

- `baseURL`: the server URL. The default is `http://127.0.0.1:11435`. `baseUrl` is an alias.
- `apiKey`: a bearer token, for a server that requires `OLLAYA_API_KEY`.
- `defaultHeaders`: extra request headers. `headers` is an alias.
- `fetch`: your own `fetch` function.
