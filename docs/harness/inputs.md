---
title: Send inputs safely
id: harness-inputs
order: 4
description: "Give each prompt your own id, so a network retry does not run it twice. Ask the session how an input ended, and cancel or move a message that waits."
keywords:
  - tanstack ai
  - harness
  - inputId
  - idempotency
  - settled
  - steer
  - cancelInput
  - setDelivery
---

A network retry can send the same prompt twice, and a client that reconnects does not know how its last prompt ended. Give each input your own id. A retry with the same id runs nothing again, and the session tells you how the input ended.

## Send a prompt with your own id

On the server, pass `inputId` to `prompt`. `await turn.receipt` resolves when the session stored the input.

```ts group=harness-inputs
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})
const host = createHarnessHost({
  persistence: {
    stores: { log: memoryLogStore(), runs: memoryPersistence().stores.runs },
  },
})
const session = await host.open(assistant, { threadId: 'user-1-thread' })

const turn = session.prompt('Summarize the report.', { inputId: 'req-42' })
const receipt = await turn.receipt
console.log(receipt.status) // 'accepted' or 'queued'
```

- The same id and the same message: you get the first input's operation, and the model is not called again.
- The same id and another message: the receipt has `status: 'rejected'` and `reason: 'conflict'`, and `await turn` rejects with `InputRejectedError`.
- `steer`, `followUp`, and `resolve` take `{ inputId }` too.
- [`configure`](./thread-settings) and [`reset`](./fork-and-reset#reset-with-a-handoff-note) are inputs too. They take `{ inputId }` and run once per id.

## Retry from the client

The client sends the same `inputId` again after a network error. The second call gets the first receipt.

```ts group=harness-inputs-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import type { AnyHarness } from '@tanstack/ai-harness'

const client = createHarnessClient<AnyHarness>({
  url: '/api/harness',
  threadId: 'user-1-thread',
})

const send = () => client.prompt('Summarize the report.', { inputId: 'req-42' })
const receipt = await send().catch(send)
console.log(receipt.operationId)
```

Make the id once per user action (a button press), and keep it for every retry of that action.

## Wait for the outcome

On the server, `session.settled(inputId)` waits until the input ends. On a durable host it reads the log, so it also works after a restart and on another host that opens the thread.

```ts group=harness-inputs
const settlement = await session.settled('req-42')
if (settlement.outcome === 'failed') {
  console.log(settlement.error?.code) // 'attempts_exhausted', 'timeout', or undefined
}
```

- `completed`: the turn has its answer.
- `failed`: the turn failed. `error.code` is set for a limit.
- `aborted`: someone cancelled the turn.
- `interrupted`: the turn waits for human input. The `resolve` that answers it is a new input.

If the turn fails after an approved tool ran (for example, the next model call fails), the interrupt is used up, and the tool does not run again. Its result stays in the transcript. To go on, send a new message. If a resume stopped before its tool ran, the interrupt stays open, and you can resolve it again.

A client gets the same answer as a `harness.input.settled` event:

```ts group=harness-inputs-client
for await (const entry of client.events()) {
  const { event } = entry
  if (event.type === 'CUSTOM' && event.name === 'harness.input.settled') {
    console.log(event.value)
  }
}
```

## Send a message while a turn runs

With `busy: 'steer'`, a prompt joins the running turn. It reaches the model at the next model call, in the order the messages arrived, and it ends with that turn.

```ts group=harness-inputs
const running = session.prompt('Plan the migration.', { inputId: 'req-43' })
const joined = session.prompt('Keep it under five steps.', {
  busy: 'steer',
  inputId: 'req-44',
})
// One turn answers both, so both get its result.
await Promise.all([running, joined])
console.log((await session.settled('req-44')).operationId === running.id) // true
```

A message that arrives while the model writes its final answer still gets an answer in the same turn.

Waiting `steer` inputs join before each model call, in the order they arrived. They join as a prefix: the join stops at the first input that has an abort request, or that `turn.canJoin` refuses. The inputs after it wait.

- The `operationId` in the receipt of a `busy: 'steer'` prompt or a `session.steer` input is the running turn. A cancel with that id cancels the turn.
- A `busy: 'steer'` prompt also has its own operation, `joined`. To stop it before it joins, call `joined.cancel()` or `session.cancel(joined.id)`. It does not join, and it settles `aborted` when the running turn ends.
- The session rejects a cancel that comes after the join started, with `reason: 'not_running'`.
- A refused or late input runs as its own turn after the running one.

To choose which inputs join, or to add records when they join, see [Choose which messages join a turn](./turn-control#choose-which-messages-join-a-turn).

## Cancel or move a waiting message

A user sends two more messages while a turn runs. Before they run, the user wants to cancel one, and wants the other to reach the running turn now. `session.inputs()` lists the inputs that wait. `cancelInput` cancels one, and `setDelivery` moves one:

```ts group=harness-inputs
const migration = session.prompt('Plan the migration.', { inputId: 'req-45' })
// The turn runs, so these two wait for their own turns.
await session.followUp('Then write the tests.', { inputId: 'req-46' })
await session.followUp('Use tabs, not spaces.', { inputId: 'req-47' })

for (const input of session.inputs()) {
  console.log(input.inputId, input.delivery, input.message)
}

await session.cancelInput('req-46')
await session.setDelivery('req-47', 'steer')
await migration
```

- `inputs()` lists the inputs in the order they run: first the steers for the running turn, then the queued turns.
- `delivery: 'steer'`: the input joins the running turn at the next model call. `'queue'`: it runs as its own turn, after the turns before it.
- A cancelled input never runs, also after a restart. It settles `aborted`.
- On a durable host, the log keeps a new delivery, and a restart obeys it. Without a log, the delivery stays in memory.
- If the input started, or joins the running turn now, the receipt has `status: 'rejected'` and `reason: 'not_waiting'`. To stop it, cancel its operation with `session.cancel(operationId)`.

A client reads the waiting inputs from the snapshot, and sends the same two inputs:

```ts group=harness-inputs-client
const { waitingInputs = [] } = await client.snapshot()
for (const input of waitingInputs) {
  console.log(input.inputId, input.delivery)
}

await client.cancelInput('req-46')
await client.setDelivery('req-47', 'steer')
```

Over `POST control`, they are `{ op: 'cancelInput', inputId }` and `{ op: 'setDelivery', inputId, delivery }`. In these two inputs, `inputId` is the id of the input that waits. A move sends a `harness.input.delivery` event with `inputId` and `delivery`, so every client can update its list.

## Send context with a message

Your tools often need to know what the user looks at: the open record, the page, or the locale. Send it as the `context` of the input. The session stores it with the input, so a turn that runs again after a restart gets the same value.

On the server, a tool reads it from its tool context:

```ts group=harness-inputs
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const openRecord = toolDefinition({
  name: 'openRecord',
  description: 'Read the id of the record that the user has open',
  inputSchema: z.object({}),
}).server(async (_input, toolContext) => {
  const context = toolContext?.context
  const recordId =
    typeof context === 'object' && context !== null && 'recordId' in context
      ? String(context.recordId)
      : 'none'
  return { recordId }
})

const records = defineHarness({
  name: 'acme/records',
  adapter: openaiText('gpt-6.1-sol'),
  tools: [openRecord],
})
const recordSession = await host.open(records, { threadId: 'user-1-records' })

await recordSession.prompt('Summarize the record I have open.', {
  context: { recordId: 'inv-42' },
})
```

`prompt`, `steer`, and `followUp` take `context`. A client sends it in a `control` input:

```ts group=harness-inputs-client
await fetch('/api/harness/control', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    threadId: 'user-1-thread',
    input: {
      op: 'prompt',
      message: 'Summarize the record I have open.',
      context: { recordId: 'inv-42' },
    },
  }),
})
```

On `POST run`, the AG-UI `forwardedProps` of the request are the `context`, for example `useChat({ forwardedProps })`. See [Connect clients to a harness](./connect).

- The `context` is part of the input for the `inputId` check. An input with the same id and another `context` gets `'conflict'`.
- When `HarnessConfig.context` and the input `context` are both plain objects, tools get them merged, and the harness value wins for a key in both. In all other cases, tools get the harness value. If the harness has no value, tools get the input value.
- Plugins and the router get it as `turn.context`. See [Pick the model of a turn](./plugins#pick-the-model-of-a-turn).
- The `context` is client data, so do not trust it. Who sent the input is the principal from `authorize`. See [Share a thread](./shared-threads).

## What you have now

- Retries that never run a prompt twice.
- The outcome of each input by its id, also after a restart.
- Messages that join a running turn in order.
- Waiting messages that a user can cancel, or move into the running turn.
- Context from the client that tools read, also after a restart.
