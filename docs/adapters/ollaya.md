---
title: Ollaya
id: ollaya-adapter
description: "Call decide() on a local Ollaya server with @tanstack/ai-ollaya."
keywords:
  - tanstack ai
  - ollaya
  - laya
  - evaluate
  - decide
  - typed decisions
  - adapter
---

You want a queue, an urgency, and a yes or no from a ticket that stays on your machine.
Install Ollaya.
Then pass `ollayaDecider` to `decide()`.

The adapter covers evaluate only.
It sends `POST /v1/systemone` to a local Ollaya server with `fetch`.
There is no Ollaya SDK.

## Install the server

On macOS or Linux, run:

```bash
curl -fsSL https://ollaya.dev/install.sh | sh
```

On Windows, run this in PowerShell:

```powershell
irm https://ollaya.dev/install.ps1 | iex
```

The server listens on `http://127.0.0.1:11435`.
This adapter uses that URL by default.

1. Run `ollaya serve`.
2. Run `ollaya pull laya:latest`.

The download page and the desktop app are on [ollaya.dev/download](https://ollaya.dev/download).

## Install the adapter

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

## Evaluate

```typescript
import { decide, choice, score, boolean } from "@tanstack/ai";
import { ollayaDecider } from "@tanstack/ai-ollaya";

const ticket = {
  subject: "Charged twice for the same invoice",
  body: "Please refund the extra payment.",
};

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

console.log(result.queue.value);
console.log(result.urgency.value);
console.log(result.refund.value);
console.log(result.meta.model);
console.log(result.meta.usage);
```

You now have `result.queue.value`, `result.urgency.value`, and `result.refund.value`.

See [Evaluate](../evaluate/evaluate) for the rest of `decide()`.

When you request `laya:latest`, `result.meta.model` can be `laya:en` or `laya:multilingual`.
The server picks the model from the text.

## Models

| Model               | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `laya:latest`       | Routes each request to `laya:en` or `laya:multilingual`. |
| `laya:en`           | English decision model (ModernBERT-large).               |
| `laya:multilingual` | Decision model for 100+ languages (mmBERT-base).         |

You can pass any other model tag as a string.

## Host and API key

By default the adapter calls `http://127.0.0.1:11435`.
The adapter does not read environment variables.
If the server is on another host, pass `baseURL`.
If the server requires `OLLAYA_API_KEY`, pass `apiKey`.

```typescript
import { ollayaDecider } from "@tanstack/ai-ollaya";

const adapter = ollayaDecider("laya:latest", {
  baseURL: "http://my-host:11435",
  apiKey: "local-token",
});
```

`baseUrl` and `headers` are aliases of `baseURL` and `defaultHeaders`.
If you set both forms, `baseURL` and `defaultHeaders` win.
A blank `baseURL` keeps the default host.

## API reference

### `ollayaDecider(model, config?)`

Creates an evaluate adapter.

- `model`: `"laya:latest"`, `"laya:en"`, `"laya:multilingual"`, or another model tag
- `config.baseURL`: server URL (default `http://127.0.0.1:11435`). `baseUrl` is an alias. A blank value keeps the default.
- `config.apiKey`: bearer token when the server requires `OLLAYA_API_KEY`
- `config.defaultHeaders`: extra request headers. `headers` is an alias.
- `config.fetch`: override `fetch`

The adapter sends `POST /v1/systemone` to that base URL.

## Next steps

- [Evaluate guide](../evaluate/evaluate): full `decide()` walkthrough
- [Evaluate a ticket](../tutorials/evaluate): build a Start route
