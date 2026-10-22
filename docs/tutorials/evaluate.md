---
title: Evaluate a ticket
id: evaluate-tutorial
description: "Build a TanStack Start route that asks typed questions about a support ticket and returns a queue, an urgency, and a refund flag your code can branch on."
keywords:
  - tanstack ai
  - evaluate
  - tutorial
  - ticket
  - typesafe
  - jev
  - start
---

This tutorial routes a support ticket with `decide()`. The result is a typed value the code can branch on.

`decide()` asks typed questions about the ticket and gives back typed answers. In this tutorial, a server route returns a queue, an urgency, and a refund flag. It takes about 10 minutes.

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

## 2. Set your key

Get a key from [TypeSafe](https://typesafe.ai). Set it in the server environment:

```bash
TYPESAFE_API_KEY=your-typesafe-api-key
```

Keep the key on the server. Do not send it to the browser.

## 3. Ask the questions on the server

Create `src/lib/evaluate-ticket.ts`. It asks three questions about the ticket. `POST` is a plain Web handler: it takes a `Request` and returns a `Response`.

```typescript
import { boolean, choice, decide, score } from '@tanstack/ai'
import { typesafeDecider } from '@tanstack/ai-typesafe'

type Ticket = {
  subject: string
  body: string
}

const adapter = typesafeDecider('jev-latest')

export function evaluateTicket(ticket: Ticket) {
  return decide({
    adapter,
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
}

export type TicketResult = Awaited<ReturnType<typeof evaluateTicket>>

function readTicket(body: unknown): Ticket | null {
  if (typeof body !== 'object' || body === null || !('ticket' in body)) {
    return null
  }
  const ticket = body.ticket
  if (typeof ticket !== 'object' || ticket === null) return null
  if (!('subject' in ticket) || !('body' in ticket)) return null
  if (typeof ticket.subject !== 'string' || typeof ticket.body !== 'string') {
    return null
  }
  return { subject: ticket.subject, body: ticket.body }
}

export async function POST(request: Request) {
  const ticket = readTicket(await request.json())
  if (ticket === null) {
    return new Response('Send { ticket: { subject, body } }.', {
      status: 400,
    })
  }
  return Response.json(await evaluateTicket(ticket))
}
```

## 4. Mount the route

Create `src/routes/api.evaluate.ts`. Start maps this file name to the `/api/evaluate` path.

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import { POST } from '@/lib/evaluate-ticket'

export const Route = createFileRoute('/api/evaluate')({
  server: {
    handlers: {
      POST: ({ request }) => POST(request),
    },
  },
})
```

## 5. Branch on the answers

Call the route from the client. `TicketResult` gives the answers their types, so `queue.value` is `'billing' | 'tech' | 'sales'`.

```typescript ignore
import type { TicketResult } from '@/lib/evaluate-ticket'

async function postTicket(ticket: { subject: string; body: string }) {
  const res = await fetch('/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket }),
  })
  if (!res.ok) throw new Error(`Evaluate failed with ${res.status}`)
  const result: TicketResult = await res.json()
  return result
}

const result = await postTicket({
  subject: 'Charged twice for the same invoice',
  body: 'Please refund the extra payment.',
})

if (result.refund.value) {
  console.log('refund path', result.queue.value, result.urgency.value)
} else {
  console.log('route to', result.queue.value, result.urgency.value)
}
```

Send that ticket. You get a queue, an urgency, and a refund flag, and your code branches on them.

## 6. Try it

1. Run the app.
2. Paste a ticket.
3. Pick a provider and click Submit.

The same app is on the Examples tab at `/ai/latest/docs/framework/react/examples/evaluate`.

<!-- ::client-example library=ai framework=react slug=evaluate -->

The full example is on GitHub: [TanStack/ai `examples/react/evaluate`](https://github.com/TanStack/ai/tree/main/examples/react/evaluate).

## How it works

`decide()` sends the ticket as `state` and asks every question about it. Each helper gives a different answer shape:

- `choice`: `value` is one option key. You also get `probability` and `confidence`.
- `score`: `value` is the nearest level label. `score` holds the raw number, and you also get `probability`.
- `boolean`: `value` is `true` when the probability of yes is 0.5 or more. You also get `probability`.

The result also has a `meta` field with the model and the usage.

## Swap the provider

The `decide()` call stays the same. Only the adapter changes:

- **OpenRouter**: `openRouterDecider('~typesafe/jev-latest')` with `OPENROUTER_API_KEY`.
- **Vercel AI Gateway**: `vercelGatewayDecider('typesafe-ai/jev')` with `AI_GATEWAY_API_KEY`.
- **Cloudflare**: `cloudflareDecider('typesafe/jev')` with a Worker binding, or with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.

For abort, middleware, and the full result shape, open the [Evaluate guide](../evaluate/evaluate).
