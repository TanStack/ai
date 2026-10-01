---
title: Send inputs safely
id: harness-inputs
order: 4
description: "Give each prompt your own id, so a network retry does not run it twice, and ask the session how an input ended, also after a restart."
keywords:
  - tanstack ai
  - harness
  - inputId
  - idempotency
  - settled
  - steer
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
  adapter: openaiText('gpt-5.6'),
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

- To stop a waiting steer, call `session.cancel(operationId)` with its operation id. It does not join, and it settles `aborted` when the running turn ends.
- A refused or late input runs as its own turn after the running one.

To choose which inputs join, or to add records when they join, see [Choose which messages join a turn](./turn-control#choose-which-messages-join-a-turn).

## What you have now

- Retries that never run a prompt twice.
- The outcome of each input by its id, also after a restart.
- Messages that join a running turn in order.
