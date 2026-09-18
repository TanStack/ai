---
title: Evaluate a ticket
id: evaluate-tutorial
description: "Build a TanStack Start route that asks typed questions about a support ticket and returns a queue, urgency, and refund flag."
keywords:
  - tanstack ai
  - evaluate
  - tutorial
  - ticket
  - typesafe
  - jev
  - start
---

You have support tickets and you need to route them in code.
This tutorial builds a server route that returns a queue, an urgency, and a refund flag.

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

Get a key from [TypeSafe](https://typesafe.ai). Then set it in the environment:

```bash
TYPESAFE_API_KEY=your-typesafe-api-key
```

Keep the key on the server. Do not send it to the browser.

## 3. Call `decide()` on the server

Add a POST handler. Build the evaluator once. Then ask three questions about the ticket.

```typescript
import { evaluator, choice, score, boolean } from '@tanstack/ai'
import { typesafeEvaluator } from '@tanstack/ai-typesafe'

type Ticket = {
  subject: string
  body: string
}

const ticketEval = evaluator({
  adapter: typesafeEvaluator('jev-latest'),
})

export async function POST(request: Request) {
  const body = (await request.json()) as { ticket: Ticket }
  const ticket = body.ticket

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
}
```

In TanStack Start, put this in `src/routes/api.evaluate.ts`. Start maps that file to `/api/evaluate`.

## 4. Read the answers

Call the route. Then branch on the typed fields.

```typescript
type Ticket = {
  subject: string
  body: string
}

async function evaluateTicket(ticket: Ticket) {
  const res = await fetch('/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket }),
  })
  return res.json() as Promise<{
    queue: { value: string; probability: number; confidence: number }
    urgency: { value: string; probability: number; score: number }
    refund: { value: boolean; probability: number }
  }>
}

const result = await evaluateTicket({
  subject: 'Charged twice for the same invoice',
  body: 'Please refund the extra payment.',
})

if (result.refund.value) {
  console.log('refund path', result.queue.value, result.urgency.value)
} else {
  console.log('route to', result.queue.value, result.urgency.value)
}
```

You now have a queue, an urgency, and a refund flag. Try a POST with that ticket.

## 5. Swap the adapter

The `decide()` call stays the same. Only the adapter changes.

- OpenRouter: `openRouterEvaluator('~typesafe/jev-latest')` and `OPENROUTER_API_KEY`
- Vercel AI Gateway: `vercelGatewayEvaluator('typesafe-ai/jev')` and `AI_GATEWAY_API_KEY`
- Cloudflare: `cloudflareEvaluator('typesafe/jev')` and a Worker binding, or `CLOUDFLARE_ACCOUNT_ID` plus `CLOUDFLARE_API_TOKEN`

## 6. Try it

Run the app. Paste a ticket. Pick a provider. Click Submit.

The same app is on the Examples tab at `/ai/latest/docs/framework/react/examples/evaluate`.

<!-- ::client-example library=ai framework=react slug=evaluate -->

The full example is on GitHub: [TanStack/ai `examples/react/evaluate`](https://github.com/TanStack/ai/tree/main/examples/react/evaluate).

See the [Evaluate guide](../evaluate/evaluate) for abort, middleware, and the full result shape.
