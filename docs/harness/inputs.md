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
  - changeInputDelivery
  - moveToolCallToBackground
---

A network retry can send the same prompt twice, and a client that reconnects does not know how its last prompt ended. Give each input your own id. A retry with the same id runs nothing again, and the session tells you how the input ended.

## Send a prompt with your own id

On the server, pass `inputId` to `send`. `await turn.receipt` resolves when the session stored the input.

```ts group=harness-inputs
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})
const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(assistant, { threadId: 'user-1-thread' })

const turn = session.send('Summarize the report.', { inputId: 'req-42' })
const receipt = await turn.receipt
console.log(receipt.status) // 'accepted' or 'queued'
```

- The same id and the same message: you get the first input's operation, and the model is not called again.
- The same id and another message: the receipt has `status: 'rejected'` and `reason: 'conflict'`, and `await turn` rejects with `InputRejectedError`.
- An input to a thread that was deleted: the receipt has `status: 'rejected'` and `reason: 'deleted'`, and `await turn` rejects with `InputRejectedError`. Nothing runs.
- `send` with `mode: 'steer'` or `mode: 'followUp'`, and `resolve`, take `{ inputId }` too.
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

const send = () => client.send('Summarize the report.', { inputId: 'req-42' })
const receipt = await send().catch(send)
console.log(receipt.operationId)
```

Make the id once per user action (a button press), and keep it for every retry of that action.

This works for every input over HTTP and the socket. A `command` or an `agent` input that the client sends again with the same `inputId` also runs once. The `inputId` of its receipt is the id that the client sent.

## Wait for the outcome

On the server, `session.settled({ inputId })` waits until the input ends. It reads the log, so on a [durable host](./durable-sessions) it also works after a restart and on another host that opens the thread.

```ts group=harness-inputs
const settlement = await session.settled({
  inputId: 'req-42',
  signal: AbortSignal.timeout(60_000),
})
if (settlement.outcome === 'failed') {
  console.log(settlement.error?.code) // 'attempts_exhausted', 'timeout', or undefined
}
```

`signal` is optional. When it aborts first, `settled` rejects with its reason. The input keeps running.

On a host that does not own the thread, the input waits for the owner. If the owner refuses it, `settled` rejects with `InputRejectedError`. The owner refuses an input when the thread is busy and the input has `busy: 'reject'`, or when the log has its id with another message. The log then has a `harness.offer.rejected` record.

- `completed`: the turn has its answer.
- `failed`: the turn failed. `error.code` is set for a limit.
- `aborted`: someone cancelled the turn.
- `interrupted`: the turn waits for a person. The `resolve` that answers it is a new input. See [Wait for a person](./waits).

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

## Continue without a new message

Sometimes the transcript already holds what the model must answer, for example a tool result that your own system stored. Start a turn with `continueWithoutMessage`, and the model answers the stored transcript. No new user message goes in:

```ts group=harness-inputs
const continued = session.continueWithoutMessage({ inputId: 'req-43' })
await continued
```

From the client:

```ts group=harness-inputs-client
const continuedReceipt = await client.continueWithoutMessage({ inputId: 'req-43' })
```

- `inputId` works as for `send`: a retry with the same id runs once.
- `continueWithoutMessage` takes `overrides`, `user`, and `context` too, as `send` does. On a host with [`access`](./access), a session acts only as the user that opened it, so leave out `user`.
- When the turn starts, the last message of the transcript must be a user message or a tool result. Else the input is rejected with the reason `nothing_to_continue`, and `await continued` rejects with `InputRejectedError`.
- A `continueWithoutMessage` that a host left after a crash runs on the next host, as a prompt does.

## Give the model a note for one turn

A reminder such as "call `finish` or `give_up`" helps the model in one turn, but it does not belong in the transcript. Pass it as `ephemeral` to `send` or `continueWithoutMessage`:

```ts group=harness-inputs
const reminded = session.continueWithoutMessage({
  inputId: 'req-44',
  ephemeral: [{ role: 'user', content: 'Call finish or give_up now.' }],
})
await reminded
```

From the client:

```ts group=harness-inputs-client
const remindedReceipt = await client.send('Summarize the report.', {
  inputId: 'req-45',
  ephemeral: [{ role: 'user', content: 'Answer in three bullets.' }],
})
```

- Each model call of the turn gets the messages right after the turn's own message (or the last stored message, for `continueWithoutMessage`), before the answers and tool results of the turn.
- The transcript, the session log, and the message store never keep them.
- A retry with the same `inputId` gets the first input, also when its `ephemeral` messages are different.
- A turn that recovery runs again after a crash has no `ephemeral` messages, because the log does not keep them.
- From the client, `ephemeral` takes user messages only. On the server, `session.send` and `session.continue` take any message.

To add a note from a hook when the model stops, see [Remind the model without saving the reminder](./turn-control#remind-the-model-without-saving-the-reminder).

## Add a system note from server code

The model needs standing context for a turn: the team's memory, the tenant's rules, or the user's plan. It is not a user message, and it should not go in the transcript. Pass `systemPreamble` to `session.send`. The strings go in ahead of the harness's own system prompts, for this one turn.

```ts group=harness-inputs
const drafted = session.send('Draft a reply to the ticket.', {
  inputId: 'req-50',
  systemPreamble: [
    'Team memory: keep the tone terse.',
    'Tenant rule: never promise a refund.',
  ],
})
await drafted
```

- `systemPreamble` comes from server code only. A client input cannot set it, so client text never reaches the system prompt.
- The strings go first, ahead of `harness.systemPrompts` and the plugin prompts.
- The harness keeps them in memory for the turn, like `ephemeral`. The transcript and the session log never store them.
- A turn that recovery runs again after a crash has no `systemPreamble`, because the log does not keep it.

## Send a message while a turn runs

With `busy: 'steer'` or `mode: 'steer'`, a message joins the running turn. It reaches the model at the next model call, in the order the messages arrived, and it ends with that turn.

```ts group=harness-inputs
const running = session.send('Plan the migration.', { inputId: 'req-43' })
const joined = session.send('Keep it under five steps.', {
  busy: 'steer',
  inputId: 'req-44',
})
// One turn answers both, so both get its result.
await Promise.all([running, joined])
console.log((await session.settled({ inputId: 'req-44' })).operationId === running.id) // true
```

A message that arrives while the model writes its final answer still gets an answer in the same turn.

Waiting `steer` inputs join before each model call, in the order they arrived. They join as a prefix: the join stops at the first input that has an abort request, or that `turn.canJoin` refuses. The inputs after it wait.

- The `operationId` in the receipt of a `busy: 'steer'` or `mode: 'steer'` message is the running turn. A cancel with that id cancels the turn.
- A `busy: 'steer'` message also has its own operation, `joined`. To stop it before it joins, call `joined.cancel()` or `session.cancel({ operationId: joined.id })`. It does not join, and it settles `aborted` when the running turn ends.
- The session rejects a cancel that comes after the join started, with `reason: 'not_running'`.
- A refused or late input runs as its own turn after the running one.

To choose which inputs join, or to add records when they join, see [Choose which messages join a turn](./turn-control#choose-which-messages-join-a-turn).

## Cancel or move a waiting message

A user sends two more messages while a turn runs. Before they run, the user wants to cancel one, and wants the other to reach the running turn now. `session.waitingInputs()` lists the inputs that wait. `cancelInput` cancels one, and `changeInputDelivery` moves one:

```ts group=harness-inputs
const migration = session.send('Plan the migration.', { inputId: 'req-45' })
// The turn runs, so these two wait for their own turns.
const tests = session.send('Then write the tests.', { inputId: 'req-46', mode: 'followUp' })
const style = session.send('Use tabs, not spaces.', { inputId: 'req-47', mode: 'followUp' })
await Promise.all([tests.receipt, style.receipt])

for (const input of session.waitingInputs()) {
  console.log(input.inputId, input.delivery, input.message)
}

await session.cancelInput({ inputId: 'req-46' })
await session.changeInputDelivery({ inputId: 'req-47', delivery: 'steer' })
await migration
```

- `waitingInputs()` lists the inputs in the order they run: first the steers for the running turn, then the queued turns.
- `delivery: 'steer'`: the input joins the running turn at the next model call. `'queue'`: it runs as its own turn, after the turns before it.
- A cancelled input never runs, also after a restart. It settles `aborted`.
- The log keeps a new delivery, and a restart obeys it.
- If the input started, or joins the running turn now, the receipt has `status: 'rejected'` and `reason: 'not_waiting'`. To stop it, cancel its operation with `session.cancel({ operationId })`.

A client reads the waiting inputs from the snapshot, and sends the same two inputs:

```ts group=harness-inputs-client
const { waitingInputs = [] } = await client.snapshot()
for (const input of waitingInputs) {
  console.log(input.inputId, input.delivery)
}

await client.cancelInput({ inputId: 'req-46' })
await client.changeInputDelivery({ inputId: 'req-47', delivery: 'steer' })
```

Over `POST control`, they are `{ op: 'cancelInput', inputId }` and `{ op: 'setDelivery', inputId, delivery }`. In these two inputs, `inputId` is the id of the input that waits. A move sends a `harness.input.delivery` event with `inputId` and `delivery`, so every client can update its list.

## Move a running tool call to the background

A long command or a subagent blocks the turn, and the user wants to go on. `session.moveToolCallToBackground()` moves the running tool call to the background:

```ts group=harness-inputs
const build = session.send('Run the full test suite.', { inputId: 'req-48' })
// Later, while the `bash` call of that turn runs:
const moved = await session.moveToolCallToBackground()
console.log(moved.status) // 'accepted', or 'rejected' with 'not_running'
await build
```

- The tool call returns at once. The model gets a short note with the job id, and the turn goes on.
- The job keeps running. When it ends, the model gets its result as a note, and an idle session starts a new turn.
- Without an argument, it moves every running call that supports it. Pass `{ toolCallId }` to move one call.
- `bash` and the single `subagent` tool support it. Other tools keep running as before.
- With no running call that supports it, the receipt has `status: 'rejected'` and `reason: 'not_running'`.
- The log keeps each job until it ends. When a crash stops a job, the next host adds the note "Background job call-1 stopped when the host restarted."

The session stays open while a job of this host runs, also when no handle holds it. A sweep with `close: 'whenIdle'` waits for these jobs too. The wake turn of a `bash` job runs as the user whose run started the job.

A client sends `{ op: 'background' }` over `POST control`. It runs no new code, so it needs no `expose` entry:

```ts group=harness-inputs-client
await fetch('/api/harness/control', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    threadId: 'user-1-thread',
    input: { op: 'background' },
  }),
})
```

Your own tool can support it too. Pass its work to `detach` from the tool context, and race the two promises:

```ts group=harness-inputs
const longReport = toolDefinition({
  name: 'longReport',
  description: 'Build the monthly report',
  inputSchema: z.object({}),
}).server((_input, toolContext) => {
  const work = new Promise<string>((resolve) => {
    setTimeout(() => resolve('The report is ready.'), 60_000)
  })
  const detach = toolContext?.detach
  return detach ? Promise.race([work, detach(work)]) : work
})
```

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

await recordSession.send('Summarize the record I have open.', {
  context: { recordId: 'inv-42' },
})
```

`send` takes `context` in every mode. A client sends it in a `control` input:

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
- The harness adds the run of the turn to a plain-object context as `run`, and it replaces a `run` key that a client sent. A context that is not a plain object gets no `run`, so tools that read `ctx.context.run` fail. See [Act as the user of a run](./plugins#act-as-the-user-of-a-run).
- Plugins and the router get it as `turn.context`. See [Pick the model of a turn](./plugins#pick-the-model-of-a-turn).
- The `context` is client data, so do not trust it. Who sent the input comes from the server: the user of the request, or of the session handle. See [Access and tenants](./access).

## What you have now

- Retries that never run a prompt twice.
- The outcome of each input by its id, also after a restart.
- Messages that join a running turn in order.
- Waiting messages that a user can cancel, or move into the running turn, and running jobs that a user can move to the background.
- Context from the client that tools read, also after a restart.
