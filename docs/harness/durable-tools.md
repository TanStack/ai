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

Add it to `tools` in `defineHarness`, as any other tool. Each finished step is in the [session log](./durable-sessions) before `step.do` resolves.

A step value must not hold a secret of the session, for example a key that a tool read. The log must not keep it, so `step.do` throws: on the first run, and on a run again after a crash. Read the secret outside `step.do`, and return an id, not a token. See [Keep tokens out of the log and the model](./auth#keep-tokens-out-of-the-log-and-the-model).

## Rules for steps

- Give each step a name that is the same on every run, for example `charge:${orderId}`.
- The same name twice in one tool call throws.
- A step value must be JSON. A `Date`, a `Map`, or a class instance is a type error, so return `date.toISOString()`, not `date`. `step.do` returns the JSON copy, the same value that a run again gets. Keep it small: store big data somewhere else and return its id.
- A step is stored once, but it can run more than once: a crash after `fn` ends and before the value is stored runs `fn` again. `fn` gets `{ idempotencyKey }`. Pass it to the system that does the side effect, so that system refuses the second call.
- The key is `${logId}:${toolCallId}:${name}`. It has no attempt part, so each run of the step gets the same key.
- To wait inside a tool, for minutes or for days, use `step.sleep`. See [Wait inside a tool](./workers#4-wait-inside-a-tool).
- To ask the user inside a tool, use `step.ask({ name, message, schema })`. The log keeps the question, so a user on any server can answer it. After a crash, `step.ask` returns the logged answer. See [Wait for a person](./waits).

`durableTool` sets `replay: 'safe'`, so the harness runs the tool again after a crash.

## Never run a tool twice

Some tools must not run again, for example a tool that sends an email. Pass `{ replay: 'never' }` as the third argument:

```ts group=harness-durable-tools
declare const mailer: {
  send: (to: string, body: string) => Promise<{ id: string }>
}

export const notify = durableTool(
  toolDefinition({
    name: 'notify',
    description: 'Email a customer',
    inputSchema: z.object({ to: z.string(), body: z.string() }),
  }),
  async ({ to, body }, { step }) => {
    const mail = await step.do(`send:${to}`, () => mailer.send(to, body))
    return { mailId: mail.id }
  },
  { replay: 'never' },
)
```

After a crash that cuts the call:

- `'safe'` (the default): the call runs again. Finished steps return their stored values.
- `'never'`: the model gets a tool error, because nobody knows if the tool finished. The call does not run again. `step` and `append` still work, so the steps and records of the first run stay in the log.

The `replay` option of `durableTool` decides this. A `replay` on the tool definition is not read.

## Add records with the tool batch

`append` adds your own records to the session log. They land with the tool result, in the same append as its `harness.tool.result` record. If a crash cuts the tool call before its result, the records never happened.

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
- A call of an agent tool gets a tool error too. An agent tool that waits for a person keeps its place in the log, and it goes on after the answer. See [When an agent tool waits](./subagents#when-an-agent-tool-waits).

The kept result is the one that the model saw before the crash. The log keeps it after every `onAfterToolCall` hook, without the secrets of the session. If a hook replaced the result, the replacement wins, also on an error.

## Outside a durable session

The same tool works in plain `chat()`. There, `step.do` runs `fn` each time, and `step.sleep` waits its full time. `step.ask` and `append` throw, because there is no log to hold the question or the records.

## What you have now

- Steps that keep their result after a crash. A step that a crash cuts can run again, so its idempotency key lets your system refuse the second side effect.
- Questions to the user that any server can answer.
- Your own records that land together with the tool batch, or not at all.
- One tool definition for durable and plain runs.
