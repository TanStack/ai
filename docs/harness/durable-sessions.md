---
title: Durable sessions
id: harness-durable-sessions
order: 4
description: "Keep a harness turn alive through a crash or a deploy. The next host continues it from the session log, one host owns a thread at a time, and a turn that keeps failing stops after a limit."
keywords:
  - tanstack ai
  - harness
  - durability
  - resume
  - session log
  - ownership
  - retries
---

A long agent turn can outlive the process that started it: a deploy restarts the server, or the machine crashes in the middle of a tool call. Every host keeps each thread in a session log. Put that log in a store that survives a restart, and the next host continues the turn. A turn that crashes the host every time stops after a limit.

## Give the host a session log

The host needs one store: `log`. It keeps the events, the transcript, the inputs, the runs, the interrupts, the tool steps, and the state of each thread. It also records which host owns each thread.

```ts group=harness-durable
import { createHarnessHost } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'

// Swap in your own stores. Memory stores do not survive a restart.
const host = createHarnessHost({ persistence: memoryPersistence() })
```

- `memoryPersistence()` has a memory `log`. A host with no `persistence` uses it too.
- To keep the log in your database, implement the [`LogStore` contract](../persistence/store-reference#logstore). A host whose log store survives a restart is a durable host.
- `metadata` is optional. It keeps data wider than one thread, for example the saved rules of `permissions()`.

### Keep a long log fast to open

A thread that runs for weeks has a long log, and a new host reads all of it to open the thread. The owner of the log writes a snapshot of the folded log to the log store. A new host opens from the snapshot and reads only the records after it. Set when the owner writes one:

```ts group=harness-durable
const snapshotHost = createHarnessHost({
  persistence: memoryPersistence(),
  log: { saveSnapshotAfter: { bytes: 500_000, ms: 60_000 } },
})
```

- `bytes`: after this many bytes of new records, as the JSON length of the records. The default is 1 000 000.
- `ms`: this long after the first record that no snapshot has. The default is 300 000 (5 minutes).
- The first limit that the log reaches wins. Only the owner writes snapshots. The type is `SnapshotTiming`.

To also drop the old records, set `lifecycle.retention.keepLogRecords` to `'since-snapshot'`. See [Drop the records before a snapshot](./lifecycle#drop-the-records-before-a-snapshot).

## Limit attempts and time

Each run of an input is one attempt: the first run, and each run after a crash. Set the limits on the harness:

```ts group=harness-durable
import { defineHarness } from '@tanstack/ai-harness'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
  durability: { maxAttempts: 5, timeoutMs: 30 * 60_000 },
})
```

- `maxAttempts`: the total attempts for one input. The default is 10.
- `timeoutMs`: the time from the first run until the input fails. A retry does not reset it. The default is no timeout, because some agent turns run for hours.

A turn that passes its time limit is stopped. It ends with the error code `timeout`.

## What happens after a crash

A host that stops also stops renewing its ownership of the thread. When the ownership expires, the next host that takes the thread finds the turn that did not end. It checks these, in order:

1. The log already has the final answer: the input ends `completed`. This wins over the checks below, so finished work is never lost.
2. An abort was asked for the turn: the input ends `aborted`. The model is not called.
3. No attempt is left: the input ends `failed`, with the error code `attempts_exhausted`.
4. The time limit passed: the input ends `failed`, with the error code `timeout`.
5. Else the turn runs again as the next attempt, and clients get a `harness.operation.resumed` event.

An input that was stored but never ran, runs now. `session.settled({ inputId })` resolves to how an input ended. See [Send inputs safely](./inputs).

A background agent that you started with `runAgainAfterCrash: true` runs again on the next host. A background child that the model started with `background: true` runs again too, unless you set `durability: { resumeBackgroundAgents: false }`. See [Keep a background agent going after a crash](./subagents#keep-a-background-agent-going-after-a-crash). The children and groups that it started before the stop do not start again: they give their stored results. See [Children of a run that runs again](./subagents#children-of-a-run-that-runs-again). For any other background agent whose host stopped, the next host:

1. Ends the run `failed`, with the message `The host stopped during this agent run.`
2. Adds a note about the failure to the transcript.
3. Starts a new turn, if you started the agent with `{ startTurnWhenDone: true }`.

`durability.recover` does not run for background agents.

## Stop a host for a deploy

`host.close()` closes every session of the host and refuses later opens. It ends each running turn `aborted`, so no host runs it again. When the server stops only for a deploy, close it with `recoverable: true`. The running turns stop, but they stay open in the log, and another host continues them at once:

```ts group=harness-durable
process.on('SIGTERM', async () => {
  await host.close({ recoverable: true })
  process.exit(0)
})
```

- Running turns and background agents stop. The host writes no end for them.
- The host gives each busy thread back with a wake. A [worker](./workers) takes it at once, so it does not wait for the ownership to expire.
- A tool that the stop cut gets the same result as after a crash. See [Mark tools that are safe to run again](#mark-tools-that-are-safe-to-run-again).
- A turn that a user cancelled still ends `aborted`.
- `session.close()` releases only your handle. It does not stop the work of the session. See [Lifecycle and retention](./lifecycle#open-and-release-a-session).

During a rolling deploy, old and new hosts run at the same time. A host that reads a log record type from a newer version does not write to that log. Its session stops with `LogVersionError`, and the new hosts continue the thread.

## Resume pending work after a deploy

A host recovers a thread when something opens it. After a deploy, nobody opens a thread whose user closed the tab, so its queued turn or background agent waits. Call `host.resumePending` to find that work and run it:

```ts group=harness-durable
const resumed = await host.resumePending({ harnesses: [assistant] })
console.log(`Resumed ${resumed.length} threads`, resumed)
```

`host.resumePending({ harnesses, close, limit })`:

1. Lists the logs that have work and no live owner: an owner that stopped, inputs that wait, or a schedule that is due. It lists at most `limit` logs. The default is 100.
2. Lists only the logs of the harnesses in `harnesses`. Pass every harness that the host serves.
3. Takes each log. If two hosts sweep at the same time, each log goes to one of them.
4. Opens the thread. The recovery steps in [What happens after a crash](#what-happens-after-a-crash) run its pending work, then the inputs that wait run.

It resolves with the threads that it took, as `{ threadId, harness, tenantId }` entries. Each thread opens in its own tenant, with no user.

If a thread that the sweep took does not open, the host gives it back with a wake in 30 seconds. The next sweep or worker tries it again.

The `close` option sets what happens to a session that the sweep opened:

- `'whenIdle'` (default): the session closes when its work ends. If the app opened the same thread too, the session stays open.
- `'never'`: the session closes like any session that no handle holds, after `lifecycle.closeIdleSessionsAfterMs`. See [When a session closes](./lifecycle#when-a-session-closes).

Call it once at boot, or from a cron route or a Durable Object alarm. To run this work all the time, on as many machines as you want, use a worker. See [Run background work on workers](./workers).

If this host already has the thread open, the sweep does not recover it again. Call `host.recover(threadId)` for that thread. See [Check a skipped turn again](#check-a-skipped-turn-again).

## Retry model errors

A model call can fail for a short time: a 429, a 5xx, an overloaded provider, or a network error. Add `retryTransientErrors()` to run the model again in the same turn, after a backoff:

```ts group=harness-durable
import { retryTransientErrors } from '@tanstack/ai-harness'

const resilient = defineHarness({
  name: 'acme/resilient',
  adapter: openaiText('gpt-6.1-sol'),
  turn: { onModelError: retryTransientErrors() },
})
```

Other errors fail the turn. To set the limits, see [Control how a turn ends](./turn-control#retry-model-errors).

The log keeps the retry count. The host writes it when a model call fails, before the backoff starts. So a turn that a crash stopped, also during the backoff, goes on with the count that it had, and a crash does not give it new retries. The count starts again at 0 after a finished tool phase and at a new turn.

## Decide recovery yourself

The steps above are the default. To change them for one input, add `durability.recover`. It runs for each input that a crashed host left. It gets `{ session, input, messages, decision, interruptedTools }`:

- `input`: the input, with `inputId`, `attempt`, `timeoutAt`, `abortRequested`, and `retries` (the model calls that failed so far).
- `messages`: the transcript from the log.
- `decision`: what the harness does by default. It is one of the 5 steps above, or `run` for an input that never ran.
- `interruptedTools`: the tool calls that recovery closes with a result text (see [Set the texts that the model gets](#set-the-texts-that-the-model-gets)). Each one has `toolCallId`, `toolName`, and `reason`: `'interrupted'` for a cut `replay: 'never'` call, `'truncated'` for a call of an answer that stopped at the output limit. Finished calls and `replay: 'safe'` calls are not in it. The list is there also when you settle the input, for example to name the cut calls in your error.

Return `undefined` to keep the decision. Or return one of these:

- `{ action: 'run', overrides? }`: run the input now. `overrides` are the [turn overrides](./turn-control#give-one-prompt-its-own-settings) of this attempt. The log keeps the JSON overrides of the input (`model`, `modelOptions`, `reasoning`, and `promptCache`). Give `adapter` and `tools` here again, because the log cannot keep objects.
- `{ action: 'settle', outcome, error? }`: end the input as `'completed'`, `'failed'`, or `'aborted'`. Without a model call.

This example fails an input with your own error code after 2 runs:

```ts group=harness-durable
const guarded = defineHarness({
  name: 'acme/guarded',
  adapter: openaiText('gpt-6.1-sol'),
  durability: {
    recover: ({ input, decision }) => {
      if (decision.action === 'run' && input.attempt >= 2) {
        return {
          action: 'settle',
          outcome: 'failed',
          error: { message: 'This request crashed the host twice.', code: 'poison_input' },
        }
      }
      return undefined
    },
  },
})
```

## Mark tools that are safe to run again

A crash can stop a run after a tool started but before its result was stored. Tell the harness what to do with `replay`:

```ts group=harness-durable
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const lookup = toolDefinition({
  name: 'lookup_order',
  description: 'Read an order',
  inputSchema: z.object({ id: z.string() }),
  replay: 'safe',
}).server(async ({ id }) => ({ id, status: 'shipped' }))
```

- `replay: 'safe'`: the tool runs again. Use it for reads and other idempotent calls.
- `replay: 'never'` (default): the model gets a tool error. Nobody knows if the tool ran, so the model checks before it tries again.

A tool that finished before the crash keeps its result. It does not run again. For a tool with side effects, such as a payment, see [Run side effects once](./durable-tools).

### Set the texts that the model gets

The model reads these tool results after a crash. To give them in your own words, set them on the harness:

```ts group=harness-durable
const worded = defineHarness({
  name: 'acme/worded',
  adapter: openaiText('gpt-6.1-sol'),
  durability: {
    interruptedToolResult:
      'The tool stopped before it finished. Check the result before you call it again.',
    truncatedToolResult: (call) =>
      `Tool call "${call.toolName}" did not run: your answer hit the output limit. Call it again with the complete input.`,
  },
})
```

- `interruptedToolResult`: the result of a `replay: 'never'` call that a crash stopped.
- `truncatedToolResult`: the result of each call in an answer that stopped at the output limit (finish reason `length`). It is a string, or a function that gets the call (`{ toolCallId, toolName }`). The input of such a call can be incomplete, so it never runs, also with `replay: 'safe'`.

With `truncatedToolResult`, a turn uses the same text live: the cut calls get their results, and the model runs again, so it can call the tool again. Recovery gives the text to a cut call that has no result in the log. See [When the output limit cuts a tool call](../chat/agentic-cycle#when-the-output-limit-cuts-a-tool-call). Without it, a cut answer ends the turn, and a cut call gets the default text `The answer was cut off at the output limit before this tool call was complete. The call did not run.`

## Continue an answer that a crash cut

A crash in the middle of a long answer loses the text that the model already wrote, and the next attempt starts the answer again. Set `continueCutOff`, and the next host keeps that text and asks the model to go on from it:

```ts group=harness-durable
const continuing = defineHarness({
  name: 'acme/continuing',
  adapter: openaiText('gpt-6.1-sol'),
  durability: { continueCutOff: true },
})
```

When a turn runs again after a crash, the host adds two messages to the transcript, in one log write:

1. An assistant message with the text that the model wrote before the crash, and its finished reasoning.
2. A user message with a note: `The previous answer was cut off. Continue exactly where it stopped, without repeating it.`

Then the model continues after the note. To use your own note, set `continueCutOff: { note: 'Go on from where you stopped.' }`. To send more than one, give a list. Each note is a user message, in that order:

```ts group=harness-durable
const twoNotes = defineHarness({
  name: 'acme/two-notes',
  adapter: openaiText('gpt-6.1-sol'),
  durability: {
    continueCutOff: {
      note: [
        'The previous assistant stream was interrupted.',
        'Continue from the partial answer.',
      ],
    },
  },
})
```

- The host keeps the answer text and the reasoning blocks that have a signature (finished blocks), so the provider can replay them. A partial with only signed reasoning also continues.
- A reasoning block with no signature (the crash cut it) is left out, because providers reject it. A partial with only such reasoning runs the model call again, with no note.
- The input of a cut tool call is left out.
- A crash before any answer text or finished reasoning runs the model call again, with no note.
- It also works after a [stop for a deploy](#stop-a-host-for-a-deploy).

## One host drives a thread

On a serverless platform, two requests for one thread often reach two instances. Only one host writes to the log of a thread at a time. Give every instance the same log store, and the log decides who owns the thread:

- The first write of a host takes the log. From then on, this host owns the thread.
- One timer renews every thread that the host owns. The host gives a thread back when it has no work.
- An input that reaches another instance waits in the log for the owner. The receipt is `queued`, and the owner runs it within a second. If the owner refuses it, `session.settled({ inputId })` on that instance rejects with `InputRejectedError`. See [Send inputs safely](./inputs).
- Every instance reads the thread, also while the owner runs a background job. A client gets the events from the log, on any instance. A `POST run` on the second instance streams the turn that the owner runs.
- The thread settings, the config values, and the state of an interrupted turn follow the changes that other hosts write.

Set the timing with the `ownership` option of the host:

```ts group=harness-durable
const ownedHost = createHarnessHost({
  persistence: memoryPersistence(),
  ownership: { expiresAfterMs: 60_000, renewEveryMs: 20_000 },
})
```

- `expiresAfterMs`: how long the ownership lasts after each renewal. The default is 30 000. After it, another host can take the thread.
- `renewEveryMs`: how often the timer renews. The default is 10 000. When you set only `expiresAfterMs`, the default is a third of `expiresAfterMs`. It must be less than `expiresAfterMs`, else `createHarnessHost` throws a `RangeError`.
- `hostId`: a stable id for this host, for example the machine or pod name. With it, a thread whose coding tools use a folder on this host stays on this host. Other hosts refuse its tool calls. The host sends a heartbeat to the log store each `renewEveryMs`. When no heartbeat came for `expiresAfterMs`, other hosts can take its threads. See [A folder on one server](./coding-workspaces#a-folder-on-one-server).

An input that waits for the owner keeps its JSON overrides (`model`, `modelOptions`, `reasoning`, and `promptCache`). The `adapter` and `tools` overrides are objects, so the owner runs the input without them.

A [wait](./waits) for a person does not always keep a host busy:

- The approvals and the questions that a turn stopped for, and the waits of background agent runs, are only in the log. The session goes idle, and an answer on any host continues the run.
- A `step.ask` in code that runs, an MCP server that asks during a tool call, and an OAuth sign-in wait in the memory of the host that runs them. That host keeps the thread until the answer comes.

An answer that reaches another host goes to the owner through the log. Until then, a plain answer waits in the log store as the user typed it. The log keeps a secret answer as `[secret]`.

### Secret answers on another host

A question with `secret: true` asks for a key or a password. The answer must not wait in the log store as the user typed it. So when the answer reaches a host that does not own the thread, it goes through the credential store:

1. The host saves the answer in the `credentials` store of `createHarnessHost`, as a one-time reference for the user who answered.
2. Only the reference goes into the log store.
3. The owner reads the answer, deletes it from the store, and answers the question.

If the host does not find the question in the log, it treats the answer as a secret too.

Pass the same `credentials` store to every host. A secret answer can be rejected:

- `secret_answer_needs_credentials`: the host has no `credentials` store, so it cannot send the answer.
- `unknown_secret_answer`: the reference was used before, it expired, or it belongs to another user.

The store keeps each reference as a credential of the type `secret_answer`:

- Its id starts with `harness:answer:`, and its `expiresAt` is 24 hours later. After that time, the harness does not read it.
- The owner deletes it when it reads it. The references that nobody read go when the question ends.
- `run.credentials.list()` does not show it. Leave the `secret_answer` type out of your own `store.list` results too, for example on a page of connected accounts.

### When a host loses a thread

A host can stop renewing for a while: a long garbage collection pause, or a lost network. Then another host takes the thread. When the first host sees this, it stops its work on the thread:

1. Its queued turns end `cancelled`, and its running work stops. The new owner runs that work again from the log.
2. Its session stays open and still reads the thread.
3. Its next write takes the thread back, when no other host owns it.

The store refuses each late write of the first host, so the log never gets the records of two owners.

## Fence your own side effects

Your payment system or job queue can refuse a call from a host that lost the thread, or a second call for the same side effect. Each run gives you two values for that in `ctx.context.run`:

- `epoch`: the ownership epoch of the log when the run started. A later owner has a larger one. Give it to a system that refuses an old epoch.
- `idempotencyKey(step, scope?)`: a key for one side effect, `${logId}:${scope}:${step}`. `scope` defaults to the run id. A run again after a host stop, on any host, gets the same key.

```ts group=harness-durable
import type { HarnessRunContext } from '@tanstack/ai-harness'

declare const payments: {
  charge: (charge: { amount: number; idempotencyKey: string }) => Promise<{ id: string }>
}

const charge = toolDefinition({
  name: 'charge',
  description: 'Charge the card',
}).server<HarnessRunContext>(async (_args, ctx) => {
  const key = ctx.context.run.idempotencyKey('charge', ctx.toolCallId)
  return payments.charge({ amount: 100, idempotencyKey: key })
})
```

Pass the tool call id as `scope` in a tool, so two calls of one tool get two keys. A step of a [durable tool](./durable-tools) gets its own key as `idempotencyKey`.

## Check a skipped turn again

A host checks the log of a thread when it opens the thread. A turn that another host still runs at that time is skipped. If that other host stops later, the turn waits until something checks again. Call `host.recover()` on a timer:

```ts group=harness-durable
setInterval(() => {
  void ownedHost.recover()
}, 15_000)
```

- `host.recover()` checks every session that this host has open. `host.recover(threadId)` checks one thread.
- `session.recoverPendingWork()` does the same for one session.
- Each call first reads the log records that other hosts wrote. Then it runs the turns whose owner stopped.
- The turns that this session already runs or queues stay as they are. Two calls at the same time run a turn once.

A [worker](./workers) does this for the threads that no host has open.

## What you have now

- Turns that continue after a crash or a deploy, also on threads that nobody opens again.
- Inputs that reach any instance and run on the instance that owns the thread.
- A host that stops its work when it loses a thread, and keys that let your own systems refuse a second side effect.
- A turn that stops after `maxAttempts` or `timeoutMs`, with a clear error code.
- Tools that run again safely or tell the model to check first, in your own words.
- Retries of short model errors, with a count that survives a crash.
