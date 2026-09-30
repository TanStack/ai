---
title: Run side effects once
id: harness-durable-tools
order: 4
description: "Put each side effect of a tool in a durable step. After a crash, the harness runs the tool again, and the finished steps return their stored values instead of running twice."
keywords:
  - tanstack ai
  - harness
  - durableTool
  - steps
  - idempotency
  - side effects
---

A crash can stop a tool between two side effects: the card is charged, but the invoice is not sent. When the harness runs the tool again, the card is charged a second time. Put each side effect in a durable step. After a crash, the finished steps return their stored values, and only the rest run.

## Put each side effect in a step

Make the tool with `durableTool`. Its `execute` gets `step` next to the normal tool context:

```ts group=harness-durable-tools
import { toolDefinition } from '@tanstack/ai'
import { durableTool } from '@tanstack/ai-harness'
import { z } from 'zod'

declare const billing: {
  charge: (orderId: string) => Promise<{ id: string }>
  sendInvoice: (chargeId: string) => Promise<void>
}

export const checkout = durableTool(
  toolDefinition({
    name: 'checkout',
    description: 'Charge an order and send the invoice',
    inputSchema: z.object({ orderId: z.string() }),
  }),
  async ({ orderId }, { step }) => {
    const payment = await step.do(`charge:${orderId}`, () =>
      billing.charge(orderId),
    )
    await step.do(`invoice:${payment.id}`, () =>
      billing.sendInvoice(payment.id),
    )
    return { chargeId: payment.id }
  },
)
```

Add it to `tools` in `defineHarness`, as any other tool. On a [durable host](./durable-sessions), each finished step is in the session log before `step.do` resolves.

## Rules for steps

- Give each step a name that is the same on every run, for example `charge:${orderId}`.
- The same name twice in one tool call throws.
- A step value must be JSON. Keep it small: store big data somewhere else and return its id.
- A step is stored once, but it can run more than once: a crash after `fn` ends and before the value is stored runs `fn` again. Make that case safe, for example with an idempotency key.

`durableTool` sets `replay: 'safe'`, so the harness runs the tool again after a crash.

## Add records with the tool batch

`append` adds your own records to the session log. They land when the tool phase completes, in the same append as the batch commit. If a crash cuts the batch, the records never happened.

```ts group=harness-durable-tools
export const remember = durableTool(
  toolDefinition({
    name: 'remember',
    description: 'Remember a fact about the user',
    inputSchema: z.object({ fact: z.string() }),
  }),
  async ({ fact }, { append }) => {
    append([{ type: 'app.memory', fact }])
    return 'Remembered.'
  },
)
```

A record type that starts with `harness.` is reserved and throws. [Build on the session log](./session-log) shows how to read your records back.

## The other tools of a cut batch

After a crash, the harness looks at each call of the batch:

- A call that finished keeps its result. It does not run again.
- A `durableTool` call, or another tool with `replay: 'safe'`, runs again.
- Any other call gets a tool error: nobody knows if the tool ran, so the model checks before it tries again.

## Outside a durable session

The same tool works in plain `chat()` and on a host without a log. There, `step.do` runs `fn` each time, and `append` throws, because there is no log to hold the records.

## What you have now

- Side effects that do not repeat after a crash.
- Your own records that land together with the tool batch, or not at all.
- One tool definition for durable and plain runs.
