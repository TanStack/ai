---
title: Evaluate
id: evaluate
order: 1
description: "Ask typed choice, score, and boolean questions about shared state with evaluator() and decide()."
keywords:
  - tanstack ai
  - evaluate
  - evaluator
  - typed decisions
  - choice
  - score
  - boolean
  - typesafe
  - jev
---

You have a ticket, a record, or a log, and you need answers your code can branch on.
A queue name. An urgency level. A yes or no.
By the end of this guide you call `decide()` once and read typed fields like `result.queue.value`.

`evaluator()` builds a client. `decide()` asks the questions. There is no stream.

## Providers

Evaluate talks to TypeSafe Jev through four adapters:

- **TypeSafe** (`@tanstack/ai-typesafe`): `typesafeEvaluator('jev-latest')`. Reads `TYPESAFE_API_KEY`.
- **OpenRouter** (`@tanstack/ai-openrouter`): `openRouterEvaluator('~typesafe/jev-latest')`. Reads `OPENROUTER_API_KEY`.
- **Vercel AI Gateway** (`@tanstack/ai-vercel-gateway`): `vercelGatewayEvaluator('typesafe-ai/jev')`. Reads `AI_GATEWAY_API_KEY`.
- **Cloudflare** (`@tanstack/ai-cloudflare`): `cloudflareEvaluator('typesafe/jev')`. Uses a Worker binding, or `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.

All four implement the same `evaluate` activity. Swap the adapter. Keep the `decide()` call.

## Installation

TypeSafe:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-typesafe
vue: @tanstack/ai-typesafe
solid: @tanstack/ai-typesafe
svelte: @tanstack/ai-typesafe
preact: @tanstack/ai-typesafe
angular: @tanstack/ai-typesafe
vanilla: @tanstack/ai-typesafe
octane: @tanstack/ai-typesafe

<!-- ::end:tabs -->

Peer dependency:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai
vue: @tanstack/ai
solid: @tanstack/ai
svelte: @tanstack/ai
preact: @tanstack/ai
angular: @tanstack/ai
vanilla: @tanstack/ai
octane: @tanstack/ai

<!-- ::end:tabs -->

Other adapters:

- OpenRouter: `@tanstack/ai-openrouter`
- Vercel AI Gateway: `@tanstack/ai-vercel-gateway`
- Cloudflare: `@tanstack/ai-cloudflare`

## Basic Usage

Build the client once. Then call `decide()` with `state` and `questions`.

```typescript
import { evaluator, choice, score, boolean } from '@tanstack/ai'
import { typesafeEvaluator } from '@tanstack/ai-typesafe'

const ticket = {
  subject: 'Charged twice for the same invoice',
  body: 'Please refund the extra payment.',
}

const ticketEval = evaluator({
  adapter: typesafeEvaluator('jev-latest'),
})

const result = await ticketEval.decide({
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

console.log(result.queue.value)
console.log(result.queue.probability)
console.log(result.queue.confidence)
console.log(result.meta.usage)
```

`evaluator()` is sync. `decide()` is async. `typesafeEvaluator` reads `TYPESAFE_API_KEY` from the environment.
To pass a key yourself, use `createTypesafeEvaluator('jev-latest', 'ts-...')`.

To evaluate through OpenRouter, swap the adapter. Everything else stays the same:

```typescript
import { evaluator, choice, score, boolean } from '@tanstack/ai'
import { openRouterEvaluator } from '@tanstack/ai-openrouter'

const ticket = {
  subject: 'Charged twice for the same invoice',
  body: 'Please refund the extra payment.',
}

const ticketEval = evaluator({
  adapter: openRouterEvaluator('~typesafe/jev-latest'),
})

const result = await ticketEval.decide({
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

console.log(result.queue.value)
```

`openRouterEvaluator` reads `OPENROUTER_API_KEY` from the environment.

## Questions

Pass a map of questions. Each key becomes a property on the result.
The key `meta` is reserved.

`state` and `instructions` can be a string, an object, or an array.
An array is one state, not a batch.

### `choice()`

The model picks one key from `options`. Option keys become the union on `.value`.
When a key needs no extra description, use `null`.

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

The model rates `state` on ordered `levels`. You must pass at least two levels.
`.value` is the nearest level label. `.score` is the raw fraction.

```typescript
import { score } from '@tanstack/ai'

const urgency = score({
  instructions: 'How urgent is this ticket?',
  levels: ['low', 'medium', 'high'],
})
```

### `boolean()`

A yes or no question. When `probability` is 0.5 or more, `.value` is `true`.
There is no `.confidence`. On the TypeSafe wire, this type is named `noul`.

```typescript
import { boolean } from '@tanstack/ai'

const refund = boolean({
  instructions: 'Is the customer asking for a refund?',
})
```

You can pass `criteria: { true: '...', false: '...' }` to describe each side.

## Result Shape

Each question key is a top-level answer. Usage and the resolved model sit on `meta`.

```typescript
import { evaluator, choice, score, boolean } from '@tanstack/ai'
import { typesafeEvaluator } from '@tanstack/ai-typesafe'

const ticketEval = evaluator({
  adapter: typesafeEvaluator('jev-latest'),
})

const result = await ticketEval.decide({
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

console.log(result.refund.value)
console.log(result.refund.probability)

console.log(result.meta.model)
console.log(result.meta.usage)
```

- **choice**: `.value` is the selected option key. `.probability` is P(selected). `.probabilities` is the full map.
- **score**: `.value` is the nearest level. `.score` is the raw fraction. `.probability` is P(that level).
- **boolean**: When P(true) is 0.5 or more, `.value` is `true`. `.probability` is P(true). No `.confidence`.

## Options

### `evaluator()`

| Option       | Type                          | Description                                              |
| ------------ | ----------------------------- | -------------------------------------------------------- |
| `adapter`    | `EvaluateAdapter`             | An evaluate adapter created with a model (required)      |
| `middleware` | `Array<GenerationMiddleware>` | Observe-only lifecycle hooks (usage, finish, error, abort) |
| `debug`      | `DebugOption`                 | Debug logging                                            |

This factory does no network work.

### `decide()`

| Option         | Type                          | Description                                                         |
| -------------- | ----------------------------- | ------------------------------------------------------------------- |
| `state`        | `string \| object \| array`   | Shared content every question judges (required)                     |
| `questions`    | `Record<string, Question>`    | Map of `choice`, `score`, and `boolean` questions (required)        |
| `abortSignal`  | `AbortSignal`                 | Cancel the in-flight request                                        |
| `modelOptions` | provider options              | Provider-specific options                                           |
| `middleware`   | `Array<GenerationMiddleware>` | Replaces middleware from `evaluator()` when passed                  |
| `debug`        | `DebugOption`                 | Replaces debug from `evaluator()` when passed                       |

## Server Endpoint

Evaluate runs on the server. The call needs your API key. Wrap it in an API
route. Call it from the client over `fetch`:

```typescript ignore
// routes/api/evaluate.ts
import { evaluator, choice, score, boolean } from '@tanstack/ai'
import { typesafeEvaluator } from '@tanstack/ai-typesafe'
import { createFileRoute } from '@tanstack/react-router'

const ticketEval = evaluator({
  adapter: typesafeEvaluator('jev-latest'),
})

export const Route = createFileRoute('/api/evaluate')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json()
        if (
          typeof body !== 'object' ||
          body === null ||
          !('ticket' in body)
        ) {
          return new Response('Invalid request body', { status: 400 })
        }
        const { ticket } = body

        const result = await ticketEval.decide({
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

        return Response.json(result)
      },
    },
  },
})
```

```typescript ignore
// client.ts
async function evaluateTicket(ticket: { subject: string; body: string }) {
  const res = await fetch('/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket }),
  })
  return res.json()
}
```

## Cancellation

Pass an `abortSignal` to cancel an in-flight request:

```typescript
import { evaluator, boolean } from '@tanstack/ai'
import { typesafeEvaluator } from '@tanstack/ai-typesafe'

const controller = new AbortController()
setTimeout(() => controller.abort(), 5000)

const ticketEval = evaluator({
  adapter: typesafeEvaluator('jev-latest'),
})

const result = await ticketEval.decide({
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

## Observability

Attach observe-only middleware to track usage, completion, errors, and
cancellation. This is the same `GenerationMiddleware` contract the media
activities use:

```typescript
import { evaluator, boolean } from '@tanstack/ai'
import { typesafeEvaluator } from '@tanstack/ai-typesafe'

const ticketEval = evaluator({
  adapter: typesafeEvaluator('jev-latest'),
})

const result = await ticketEval.decide({
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

> **Tip:** Pass `otelMiddleware()` to emit OpenTelemetry spans for evaluate
> calls. See [OpenTelemetry](../advanced/otel).

## Environment Variables

Each adapter reads its own key:

- TypeSafe: `TYPESAFE_API_KEY`
- OpenRouter: `OPENROUTER_API_KEY`
- Vercel AI Gateway: `AI_GATEWAY_API_KEY` (or `VERCEL_OIDC_TOKEN`)
- Cloudflare REST: `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`

You only need the key for the adapter you pick.

## Error Handling

```typescript
import { evaluator, boolean } from '@tanstack/ai'
import { typesafeEvaluator } from '@tanstack/ai-typesafe'

const ticketEval = evaluator({
  adapter: typesafeEvaluator('jev-latest'),
})

try {
  const result = await ticketEval.decide({
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

If `questions` is empty, `decide()` throws before any request.
If a question key is `meta`, `decide()` throws.

## Runnable Example

`examples/react/evaluate` is a small TanStack Start app that runs this page.
Paste a support ticket. The UI shows queue, urgency, and refund.
A dropdown switches among the four adapters over the same `decide()` call.

```bash
pnpm --filter evaluate dev
```

Open http://localhost:3100. Copy `.env.example` to `.env` first, and add a key for the adapter you pick.

Add a key for the adapter you pick. Then open the app and paste a ticket.

## Next Steps

- [Evaluate a ticket](../tutorials/evaluate) - Build a Start route that routes a ticket
- [TypeSafe Adapter](../adapters/typesafe) - Direct Jev, models, and explicit API keys
- [OpenRouter Adapter](../adapters/openrouter) - Evaluate through your OpenRouter key
- [Vercel AI Gateway](../adapters/vercel-gateway) - Evaluate through the Gateway
- [Cloudflare Adapter](../adapters/cloudflare) - Evaluate from a Worker or REST
