---
title: Run a tool without a model
id: harness-tool-runs
order: 5
description: "Run one harness tool from a schedule, a webhook, or any server code, with no model turn. The call goes through your middleware, input check, and permissions, and its result joins the transcript."
keywords:
  - tanstack ai
  - harness
  - tool
  - schedule
  - webhook
  - out-of-band
  - expose
---

A cron job or a webhook needs to run one tool, not hold a conversation. You want fresh stats every hour, or a tool that runs when a pull request opens. A full model turn is waste, and the model could pick the wrong tool. `session.tool` runs one tool with no model. The call still goes through your middleware, the input check, and `permissions()`, and the call and its result join the transcript.

## Run a tool from server code

Call `session.tool(name, args?)`. A schedule or a webhook handler calls it.

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
const run = session.tool('fetchStats', { window: '1h' })
const { text } = await run
```

- The call goes through your middleware, the input check, and `permissions()`, the same as a model call.
- The tool call and its result join the transcript, so the next chat turn sees them.
- A tool that asks for approval stops the turn with an interrupt. Resolve it as you resolve any approval. See [Ask before a tool runs](./permissions).
- Pass `inputId` to make the run idempotent, as [`prompt`](./inputs) does.
- `session.tool` runs only a tool in `harness.tools`. An unknown name fails the run.

## Tag a run with its trigger

Pass `meta` to record why the tool ran, for example the schedule or the webhook event. The harness sends it as a `tanstack.injection` custom event with the tool call id.

```ts group=harness-tool-runs
const fromWebhook = session.tool(
  'fetchStats',
  { window: '24h' },
  { meta: { trigger: 'webhook', deliveryId: 'whk-99' } },
)
await fromWebhook
```

A client reads the `tanstack.injection` event to show which runs a trigger started, not a person.

## Let a client run a tool

Add the tool to `expose.tools`. A client then runs it with a `tool` input. A tool that is not in the list is refused with `not_exposed`. The harness exposes nothing by default.

```ts group=harness-tool-runs-client
await fetch('/api/harness/control', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    threadId: 'ops-thread',
    input: { op: 'tool', name: 'fetchStats', args: { window: '1h' } },
  }),
})
```

The capabilities document marks each tool with `exposed`, so a client shows only the tools it can run. See [Connect clients to a harness](./connect).

An MCP client runs an exposed tool through a `tool_<name>` tool. See [Use a harness from any MCP client](./mcp-server#3-use-the-tools).

## What you have now

- A tool that runs from a schedule, a webhook, or any server code, with no model turn.
- Each run through your middleware, input check, and `permissions()`.
- The call and its result in the transcript, for the next chat turn.
- A trigger tag on each run, through the `tanstack.injection` event.
- One tool open to clients over HTTP and MCP, without the rest of the agent.
