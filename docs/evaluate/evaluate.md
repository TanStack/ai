---
title: Evaluate
id: evaluate
order: 1
description: "Ask typed choice, score, and yes-or-no questions about a ticket, a record, or a log with decide(). Branch on the answers in plain TypeScript."
keywords:
  - tanstack ai
  - evaluate
  - decide
  - typed decisions
  - choice
  - score
  - boolean
  - typesafe
  - jev
  - ollaya
  - laya
---

You have a ticket, a record, or a log, and your code must branch on it. You need a queue name, an urgency level, or a yes or no. Prose from a chat model is hard to branch on.

`decide()` asks a decision model typed questions about your data. You read the answers as typed fields, like `result.queue.value`. There is no stream.

## Quick setup

1. Install the core package and the TypeSafe adapter:

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

2. Put your key on the server. The adapter reads it at runtime:

```bash
TYPESAFE_API_KEY=your-typesafe-api-key
```

3. Call `decide()` on the server with a `state` and a map of `questions`:

```typescript
import { decide, choice, score, boolean } from '@tanstack/ai'
import { typesafeDecider } from '@tanstack/ai-typesafe'

const ticket = {
  subject: 'Charged twice for the same invoice',
  body: 'Please refund the extra payment.',
}

const result = await decide({
  adapter: typesafeDecider('jev-latest'),
  state: ticket,
  questions: {
    queue: choice({
      instructions: 'Which team should handle this ticket?',
      options: {
        billing: 'Payments, invoices, refunds',
        tech: 'Bugs, outages, integrations',
        sales: 'Pricing, upgrades, new accounts',
      },
    }),
    urgency: score({
      instructions: 'How urgent is this ticket?',
      levels: ['low', 'medium', 'high'],
    }),
    refund: boolean({
      instructions: 'Is the customer asking for a refund?',
    }),
  },
})

if (result.queue.value === 'billing' && result.refund.value) {
  console.log('Send to billing as a refund, urgency:', result.urgency.value)
}
```

`result.queue.value` has the type `'billing' | 'tech' | 'sales'`. TypeScript knows every answer.

## How it works

- `state` is the data that every question judges. It can be a string, an object, or an array. An array is one state, not a batch.
- Each key in `questions` becomes a property on the result.
- The key `meta` is reserved. `result.meta` holds the model and the token usage.
- Every evaluate adapter uses the same `decide()` call. To change provider, change the adapter.

## The three question types

### `choice()`

The model picks one key from `options`. The option keys become the union type of `.value`. If a key needs no description, use `null`.

```typescript
import { choice } from '@tanstack/ai'

const queue = choice({
  instructions: 'Which team should handle this ticket?',
  options: {
    billing: 'Payments, invoices, refunds',
    tech: 'Bugs, outages, integrations',
    sales: 'Pricing, upgrades, new accounts',
  },
})
```

### `score()`

The model rates `state` on ordered `levels`, lowest first. You must pass at least two levels. `.value` is the nearest level label. `.score` is the raw fraction.

```typescript
import { score } from '@tanstack/ai'

const urgency = score({
  instructions: 'How urgent is this ticket?',
  levels: ['low', 'medium', 'high'],
})
```

### `boolean()`

A yes or no question. If the probability of `true` is 0.5 or more, `.value` is `true`. There is no `.confidence`.

```typescript
import { boolean } from '@tanstack/ai'

const refund = boolean({
  instructions: 'Is the customer asking for a refund?',
  criteria: {
    true: 'The customer asks for money back',
    false: 'The customer asks for something else',
  },
})
```

`criteria` is optional. Use it to describe each side.

## Pick a provider

| Provider          | Adapter                                                | Key                                                                      |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| [Ollaya](../adapters/ollaya) | `ollayaDecider('laya:latest')` (`@tanstack/ai-ollaya`) | No key. Local server at `http://127.0.0.1:11435`.          |
| [TypeSafe](../adapters/typesafe) | `typesafeDecider('jev-latest')` (`@tanstack/ai-typesafe`) | `TYPESAFE_API_KEY`                                 |
| [OpenRouter](../adapters/openrouter) | `openRouterDecider('~typesafe/jev-latest')` (`@tanstack/ai-openrouter`) | `OPENROUTER_API_KEY`                 |
| [Vercel AI Gateway](../adapters/vercel-gateway) | `vercelGatewayDecider('typesafe-ai/jev')` (`@tanstack/ai-vercel-gateway`) | `AI_GATEWAY_API_KEY` (or `VERCEL_OIDC_TOKEN`) |
| [Cloudflare](../adapters/cloudflare) | `cloudflareDecider('typesafe/jev')` (`@tanstack/ai-cloudflare`) | A Worker binding, or `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` |
| [OpenAI](../adapters/openai#evaluate) | `openaiDecider('gpt-6-luna')` (`@tanstack/ai-openai`) | `OPENAI_API_KEY`                                     |

You only need the key for the adapter you pick. To use OpenRouter, install `@tanstack/ai-openrouter` and swap the adapter:

```typescript
import { decide, boolean } from '@tanstack/ai'
import { openRouterDecider } from '@tanstack/ai-openrouter'

const result = await decide({
  adapter: openRouterDecider('~typesafe/jev-latest'),
  state: 'Please refund the extra payment.',
  questions: {
    refund: boolean({
      instructions: 'Is the customer asking for a refund?',
    }),
  },
})

console.log(result.refund.value)
```

## Call it from the browser

`decide()` needs your API key, so it runs on the server. Put it in a route and call the route from the client.

Server route:

```typescript
import { decide, choice, score, boolean } from '@tanstack/ai'
import { typesafeDecider } from '@tanstack/ai-typesafe'

export async function POST(request: Request) {
  const body: unknown = await request.json()
  if (
    typeof body !== 'object' ||
    body === null ||
    !('ticket' in body) ||
    typeof body.ticket !== 'object' ||
    body.ticket === null
  ) {
    return new Response('Invalid request body', { status: 400 })
  }

  const result = await decide({
    adapter: typesafeDecider('jev-latest'),
    state: body.ticket,
    questions: {
      queue: choice({
        instructions: 'Which team should handle this ticket?',
        options: {
          billing: 'Payments, invoices, refunds',
          tech: 'Bugs, outages, integrations',
          sales: 'Pricing, upgrades, new accounts',
        },
      }),
      urgency: score({
        instructions: 'How urgent is this ticket?',
        levels: ['low', 'medium', 'high'],
      }),
      refund: boolean({
        instructions: 'Is the customer asking for a refund?',
      }),
    },
  })

  return Response.json(result)
}
```

Client:

```typescript
export async function evaluateTicket(ticket: { subject: string; body: string }) {
  const res = await fetch('/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket }),
  })
  return res.json()
}
```

For a full Start route, see the tutorial [Evaluate a ticket](../tutorials/evaluate).

## Try the example

`examples/react/evaluate` is a small TanStack Start app. Paste a support ticket and the UI shows queue, urgency, and refund. A dropdown lists five adapters, and every one runs the same questions.

1. Copy `.env.example` to `.env`.
2. If you pick a hosted adapter, add its key in `.env`.
3. If you pick Ollaya, run `ollaya serve`, then `ollaya pull laya:latest`. Ollaya needs no API key.
4. Run the dev server:

```bash
pnpm --filter evaluate dev
```

Open http://localhost:3100 and paste a ticket.

## Advanced

### Result fields

```typescript
import { decide, choice, score, boolean } from '@tanstack/ai'
import { typesafeDecider } from '@tanstack/ai-typesafe'

const result = await decide({
  adapter: typesafeDecider('jev-latest'),
  state: 'Please refund the extra payment.',
  questions: {
    queue: choice({
      instructions: 'Which team should handle this ticket?',
      options: {
        billing: 'Payments, invoices, refunds',
        tech: 'Bugs, outages, integrations',
      },
    }),
    urgency: score({
      instructions: 'How urgent is this ticket?',
      levels: ['low', 'medium', 'high'],
    }),
    refund: boolean({
      instructions: 'Is the customer asking for a refund?',
    }),
  },
})

console.log(result.queue.value)
console.log(result.queue.probability)
console.log(result.queue.confidence)
console.log(result.queue.probabilities)

console.log(result.urgency.value)
console.log(result.urgency.score)
console.log(result.urgency.probability)
console.log(result.urgency.confidence)
console.log(result.urgency.legend)
console.log(result.urgency.probabilities)

console.log(result.refund.value)
console.log(result.refund.probability)

console.log(result.meta.model)
console.log(result.meta.usage)
```

| Question  | Fields                                                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `choice`  | `.value` is the selected option key. `.probability` is P(selected). `.probabilities` is the full map. `.confidence` is also present.                                                    |
| `score`   | `.value` is the nearest level. `.score` is the raw fraction. `.probability` is P(that level). `.legend` maps each level index to its label. `.probabilities` is the full map, keyed by level index. |
| `boolean` | `.value` is `true` when P(true) is 0.5 or more. `.probability` is P(true). No `.confidence`.                                                                                           |

On the TypeSafe wire, the `boolean` question type is named `noul`.

### `decide()` options

| Option         | Type                          | Description                                                  |
| -------------- | ----------------------------- | ------------------------------------------------------------ |
| `adapter`      | `EvaluateAdapter`             | An evaluate adapter with a model. Required.                  |
| `state`        | `string \| object \| array`   | The data that every question judges. Required.               |
| `questions`    | `Record<string, Question>`    | Map of `choice`, `score`, and `boolean` questions. Required. |
| `abortSignal`  | `AbortSignal`                 | Cancel the request                                           |
| `modelOptions` | provider options              | Provider-specific options                                    |
| `middleware`   | `Array<GenerationMiddleware>` | Observe-only lifecycle hooks (usage, finish, error, abort)   |
| `debug`        | `DebugOption`                 | Debug logging                                                |

`instructions` on each question can also be a string, an object, or an array.

### API keys in code

`typesafeDecider` reads `TYPESAFE_API_KEY`. To pass a key in code, use `createTypesafeDecider('jev-latest', 'ts-...')`.

### Cancel a request

Pass an `abortSignal`:

```typescript
import { decide, boolean } from '@tanstack/ai'
import { typesafeDecider } from '@tanstack/ai-typesafe'

const controller = new AbortController()
setTimeout(() => controller.abort(), 5000)

const result = await decide({
  adapter: typesafeDecider('jev-latest'),
  state: 'Please refund the extra payment.',
  questions: {
    refund: boolean({
      instructions: 'Is the customer asking for a refund?',
    }),
  },
  abortSignal: controller.signal,
})

console.log(result.refund.value)
```

### Track usage

Add observe-only middleware to track usage, completion, errors, and cancellation. It is the same `GenerationMiddleware` contract that the media activities use. See [Middleware](../advanced/middleware).

```typescript
import { decide, boolean } from '@tanstack/ai'
import { typesafeDecider } from '@tanstack/ai-typesafe'

const result = await decide({
  adapter: typesafeDecider('jev-latest'),
  state: 'Please refund the extra payment.',
  questions: {
    refund: boolean({
      instructions: 'Is the customer asking for a refund?',
    }),
  },
  middleware: [
    {
      name: 'usage-logger',
      onUsage: (_ctx, usage) => {
        console.log(`prompt tokens: ${usage.promptTokens}`)
      },
    },
  ],
})

console.log(result.refund.value)
```

> [!TIP]
> Pass `otelMiddleware()` to emit OpenTelemetry spans for evaluate calls. See [OpenTelemetry](../advanced/otel).

### Errors

`decide()` throws in these cases:

- `questions` is empty. It throws before any request.
- A question key is `meta`. It throws before any request.
- The provider answers, but `decide()` cannot map an answer. For example, an answer is missing, has the wrong type, or has no probability for its value.

In the last case, `onUsage` and the `evaluate:usage` event still get the token usage of that call, before `onError` runs. `onFinish` does not run.

```typescript
import { decide, boolean } from '@tanstack/ai'
import { typesafeDecider } from '@tanstack/ai-typesafe'

try {
  const result = await decide({
    adapter: typesafeDecider('jev-latest'),
    state: 'Please refund the extra payment.',
    questions: {
      refund: boolean({
        instructions: 'Is the customer asking for a refund?',
      }),
    },
  })
  console.log(result.refund.value)
} catch (error) {
  if (error instanceof Error) {
    console.error('Evaluate failed:', error.message)
  }
}
```
