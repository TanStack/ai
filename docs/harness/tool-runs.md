---
title: Run a tool without a model
id: harness-tool-runs
order: 5
description: "Run one harness tool from a schedule, a webhook, or any server code, with no model turn. The call goes through your middleware, input check, and permissions, and its result joins the transcript."
keywords:
  - tanstack ai
  - harness
  - runTool
  - schedule
  - webhook
  - out-of-band
  - expose
---

A cron job or a webhook needs to run one tool, not hold a conversation. You want fresh stats every hour, or a tool that runs when a pull request opens. A full model turn is waste, and the model could pick the wrong tool. `session.tool` runs one tool with no model. The call still goes through your middleware, the input check, and `permissions()`, and the call and its result join the transcript.

## Run a tool from server code

Call `session.runTool({ name, args })`. A schedule or a webhook handler calls it.

```ts group=harness-tool-runs
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const fetchStats = toolDefinition({
  name: 'fetchStats',
  description: 'Read the latest usage stats',
  inputSchema: z.object({ window: z.string() }),
}).server(async ({ window }) => ({ window, signups: 42 }))

const dashboard = defineHarness({
  name: 'acme/dashboard',
  adapter: openaiText('gpt-6.1-sol'),
  tools: [fetchStats],
  expose: { tools: ['fetchStats'] },
})

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(dashboard, { threadId: 'ops-thread' })

// From a cron job, every hour:
const run = session.runTool({ name: 'fetchStats', args: { window: '1h' } })
const { text } = await run
```

- The call goes through your middleware, the input check, and `permissions()`, the same as a model call.
- The tool call and its result join the transcript, so the next chat turn sees them.
- A tool that asks for approval stops the turn with an interrupt. Resolve it as you resolve any approval. See [Ask before a tool runs](./permissions).
- While an approval waits, `session.tool` is refused with `pending_interrupts`. Answer the approval first.
- Pass `inputId` to make the run idempotent, as [`send`](./inputs) does.

TypeScript types `args` from the input schema of a harness tool. `session.runTool({ name: 'fetchStats', args: { window: 1 } })` does not compile. A plugin tool takes any `args`, and its input schema checks them when the tool runs.

## Tag a run with its trigger

Pass `meta` to record why the tool ran, for example the schedule or the webhook event. The harness sends it as a `tanstack.injection` custom event with the tool call id.

```ts group=harness-tool-runs
const fromWebhook = session.runTool({
  name: 'fetchStats',
  args: { window: '24h' },
  meta: { trigger: 'webhook', deliveryId: 'whk-99' },
})
await fromWebhook
```

A client reads the `tanstack.injection` event to show which runs a trigger started, not a person.

## Find the thread from inside the tool

A tool that writes to your own database needs to know which thread called it. Each tool call of a harness turn gets `threadId` and `runId` in its context:

```ts group=harness-tool-runs
const saveReport = toolDefinition({
  name: 'saveReport',
  description: 'Save the stats report for this thread',
  inputSchema: z.object({ signups: z.number() }),
}).server(async ({ signups }, ctx) => ({
  savedFor: ctx?.threadId,
  run: ctx?.runId,
  signups,
}))
```

This works for a model call and for `session.tool`. Your own `context` data stays as you sent it.

## Let a client run a tool

1. Add the tool to `expose.tools`. TypeScript suggests the names in `tools`, and `defineHarness` throws for any other name.
2. Run it from the client with `client.runTool({ name, args, meta, inputId })`. `args` is typed from the tool's input schema.

```ts group=harness-tool-runs-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import type { dashboard } from './harness'

const client = createHarnessClient<typeof dashboard>({
  url: '/api/harness',
  threadId: 'ops-thread',
  headers: { authorization: 'Bearer my-token' },
})

const receipt = await client.runTool({
  name: 'fetchStats',
  args: { window: '1h' },
  inputId: 'hourly-stats-09',
})
```

- The receipt has your `inputId`. It is `queued` while another turn runs.
- A retry with the same `inputId` and the same `args` does not run the tool again. The same `inputId` with other `args` is rejected with `conflict`.
- A tool that is not in `expose.tools` is refused with `not_exposed`. The harness exposes nothing by default.

The capabilities document marks each tool with `exposed`, so a client shows only the tools it can run. See [Connect clients to a harness](./connect).

An MCP client runs an exposed tool through a `tool_<name>` tool. See [Use a harness from any MCP client](./mcp-server#3-use-the-tools).

To give the model a fact from a webhook instead of running a tool, add a record to the thread. See [Let a client add records](./session-log#let-a-client-add-records).

## What you have now

- A tool that runs from a schedule, a webhook, or any server code, with no model turn.
- Each run through your middleware, input check, and `permissions()`, with its result in the transcript.
- The thread and the run in the context of each tool call.
- A trigger tag on each run, through the `tanstack.injection` event.
- One typed tool open to clients over HTTP and MCP, without the rest of the agent.
