---
title: Run background work on workers
id: harness-workers
order: 4
description: "Run harness threads that no user has open: inputs that a server submits, schedules, tools that wait for hours, and the work that a deploy cut. A worker takes each thread from the session log."
keywords:
  - tanstack ai
  - harness
  - worker
  - createHarnessWorker
  - submit
  - schedule
  - step.sleep
  - deploy
---

Some work has no user who waits for it: a report that a cron job asks for, a reminder in one day, a tool that waits for a payment, or a turn that a deploy cut. Nobody opens these threads, so nothing runs them. A worker finds each thread in the session log that has work and no live host, takes it, runs the work, and gives it back.

Every host on this page shares one log store. In production, that is your [`LogStore`](../persistence/store-reference#logstore). Here, `memoryLogState()` gives two hosts one memory log, the same as two servers on one database.

## 1. Start a worker

Make a host for the worker, and start the worker on it:

```ts group=harness-workers
import {
  createHarnessHost,
  createHarnessWorker,
  defineHarness,
} from '@tanstack/ai-harness'
import { memoryLogState, memoryLogStore } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})

// One log store for every host. Swap in your own store.
const state = memoryLogState()
const hostOn = () =>
  createHarnessHost({ persistence: { stores: { log: memoryLogStore({ state }) } } })

const workerHost = hostOn()
const worker = createHarnessWorker({ host: workerHost, harnesses: [assistant] })
```

- `harnesses`: the harnesses whose threads the worker runs, matched by name.
- `concurrency`: at most how many threads the worker runs at the same time. The default is 8.
- `pollMs`: how long the worker waits after a look that found no work. The wait doubles after each empty look, up to 30 seconds. The default is 1 000.
- `signal`: an `AbortSignal` that stops the worker, the same as `stop()`.

Run as many workers as you want, on as many machines. Each thread goes to one of them. Each thread opens in its own tenant, with no user.

If a thread fails to open, the worker logs the error and skips that thread for a time. The time doubles after each failure in a row, up to 5 minutes. The other threads still run.

## 2. Submit an input from any server

A cron route or a webhook wants the agent to do a job, but it must not wait for the turn. `host.submit` stores the input in the log and runs nothing:

```ts group=harness-workers
const apiHost = hostOn()

const receipt = await apiHost.submit({
  harness: assistant,
  threadId: 'weekly-report',
  input: { op: 'prompt', message: 'Write the weekly report.' },
  inputId: 'weekly-report-2026-42',
})
console.log(receipt.status) // 'queued'
```

- The input waits until a host owns the thread. That is the host that runs the thread now, or a worker.
- Pass `inputId` so that a retry is safe. The same id with the same input is a duplicate. The same id with another input gets `rejected` with `conflict`.
- `input` is any input that runs on the owner: a prompt, a steer, a follow-up, an answer, a cancel, a command, and more.
- On a host with [`access`](./access), pass `user`. The input needs the same action as on a handle, else `submit` throws `AccessDeniedError` and stores nothing.
- An answer or a cancel is checked with the run that it targets, from the log. A cancel must name its `operationId`. A run that the log does not have gets `rejected` with `unknown_run`. To drop an input that waits, use `cancelInput`.

## 3. Run an input later

`session.schedule` runs an input at a time that you pick. The log keeps the schedule, so it runs once, also after a restart or on another machine:

```ts group=harness-workers
const session = await apiHost.open(assistant, { threadId: 'daily-summary' })

const { scheduleId } = await session.schedule({
  at: Date.now() + 60 * 60 * 1000,
  input: { op: 'prompt', message: 'Write the daily summary.' },
})
await session.close()
```

- While a host has the thread open, that host runs the input at `at`.
- When no host has the thread open, the log store wakes a worker at `at`.
- A time that passed runs at once.
- Pass `scheduleId` to pick the id. A second call with the id of a schedule that waits writes nothing.
- `user` is who sends the input when it runs. The default is the user of the open.

To stop a schedule that did not run yet:

```ts group=harness-workers
const later = await apiHost.open(assistant, { threadId: 'daily-summary' })
await later.cancelSchedule({ scheduleId })
await later.close()
```

A schedule that ran, or an unknown id, changes nothing. While another live host owns the thread, `schedule` and `cancelSchedule` throw.

## 4. Wait inside a tool

A tool sends a reminder, waits one day, and then sends a follow-up. `step.sleep` in a [durable tool](./durable-tools) waits, and the log keeps the time it wakes:

```ts group=harness-workers
import { toolDefinition } from '@tanstack/ai'
import { durableTool } from '@tanstack/ai-harness'
import { z } from 'zod'

declare const mail: {
  send: (message: { to: string; text: string }) => Promise<void>
}

export const remind = durableTool(
  toolDefinition({
    name: 'remind',
    description: 'Remind a customer, and follow up one day later',
    inputSchema: z.object({ to: z.string() }),
  }),
  async ({ to }, { step }) => {
    await step.do('send-reminder', () => mail.send({ to, text: 'Your invoice is due.' }))
    await step.sleep({ name: 'wait-a-day', ms: 24 * 60 * 60 * 1000 })
    await step.do('send-follow-up', () => mail.send({ to, text: 'Your invoice is late.' }))
    return 'Sent.'
  },
)
```

- A sleep of 30 seconds or less waits in the process. The host keeps the thread while it waits.
- A longer sleep on a thread that only a worker runs gives the thread back to the log store with a wake. The worker slot is free, and `worker.stop()` does not wait for the sleep. On a thread that your app has open, the sleep waits in the process.
- At the wake time, or when the host stops, a worker runs the tool call again. The finished steps return their stored values, and the sleep waits only for the time that is left.
- `name` is a step name. Use the same name on every run, and not the name of a `do` step of the same call.
- Agent code has the same `step.sleep` on `ctx.harness.step`, in a run started with `runAgainAfterCrash: true`. See [Keep a background agent going after a crash](./subagents#keep-a-background-agent-going-after-a-crash).

## 5. Restart for a deploy

Stop a server with `recoverable: true`. Its running work stops, and the host gives each busy thread back with a wake, so a worker takes it at once:

```ts group=harness-workers
process.on('SIGTERM', async () => {
  await apiHost.close({ recoverable: true })
  process.exit(0)
})
```

A worker host stops the same way. To let its threads end their work first, call `worker.stop()`. It stops the looks for work, and waits until the threads that the worker runs close:

```ts group=harness-workers
process.on('SIGTERM', async () => {
  await worker.stop()
  await workerHost.close()
})
```

To stop the work at once, close the host with `recoverable: true` instead. Another worker runs that work again.

## What you have now

- A pool of workers that runs every thread with work and no live host.
- Inputs that any server submits, and inputs that run at a time you pick.
- Tools that wait for hours, and continue on another machine after a stop.
- Deploys that hand the cut work to a worker at once.

A client reads these threads as any other thread. See [Connect clients](./connect).
