---
title: Track usage and cost
id: harness-usage
order: 7
description: "Read the tokens and the cost of a thread, in total, by model, and by sender. Show a live total, stop a person who is over budget, and add /usage with your own prices."
keywords:
  - tanstack ai
  - harness
  - usage
  - cost
  - tokens
  - billing
---

Your app bills each person for what they use, or stops a thread that costs too much. For that, you need the tokens and the cost of every model call, per thread and per person. The harness adds up every model call of a thread, and `session.usage()` returns the totals.

## Read the totals

```ts group=harness-usage
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(assistant, {
  threadId: 'team-thread',
  principal: { id: 'ada' },
})

await session.prompt('Summarize the open tickets.')

const { total, byModel, bySender } = session.usage()
console.log(total.calls, total.totalTokens, total.cost)
console.log(byModel['openai/gpt-6.1-sol']?.totalTokens, bySender.ada?.cost)
```

The totals have three groups. `snapshot().usage` has the same data:

- `total`: every model call of the thread.
- `byModel`: the calls of each model, keyed by `provider/model`, for example `openai/gpt-6.1-sol`.
- `bySender`: the calls of each person, keyed by the principal id. It has only the calls of a known sender, so its sum can be less than `total`.

Each entry has `calls`, `promptTokens`, `completionTokens`, `totalTokens`, `cachedTokens`, and `cacheWriteTokens`. If a provider reported a cost, the entry also has `cost`. The harness adds the costs that the providers report, in their currency. It uses no price list of its own.

## What counts

At the end of each call, the provider reports its usage. These calls count:

- The model calls of each turn, for the sender of that turn.
- The subagents that a turn starts, for the same sender.
- Background agents, for the person who started the agent.

A call that fails before it ends does not count. In a [shared thread](./shared-threads), each message runs as its sender, so `bySender` shows what each person used.

## Where the totals live

The totals stay with the thread:

- A durable host (with `stores.log`) keeps one `harness.usage` record per call in the log. The log keeps the totals after a restart.
- Another host with `stores.metadata` keeps the totals there.
- A host with neither keeps them in memory.

A [fork of a thread](./fork-and-reset) starts at zero.

## Show a live total

Each call sends a `harness.usage` event on the operation that made the call. When the event arrives, read the new totals:

```ts group=harness-usage-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import type { assistant } from './harness'

const client = createHarnessClient<typeof assistant>({
  url: '/api/harness',
  threadId: 'team-thread',
})

for await (const { event } of client.events()) {
  if (event.type === 'CUSTOM' && event.name === 'harness.usage') {
    const { usage } = await client.snapshot()
    console.log(`Tokens so far: ${usage.total.totalTokens}`)
  }
}
```

## Stop a person who is over budget

Read the totals of the sender before you send a prompt. This route refuses a prompt from a person who used more than their budget:

```ts group=harness-usage
const BUDGET_USD = 5

export async function send(threadId: string, userId: string, text: string) {
  const thread = await host.open(assistant, { threadId })
  const spent = thread.usage().bySender[userId]?.cost ?? 0
  if (spent >= BUDGET_USD) {
    return { error: 'You used your budget for this thread.' }
  }
  return thread.prompt(text, { principal: { id: userId } }).receipt
}
```

## Show usage and price the calls

Many providers report no cost, so `cost` stays empty. The `usage()` plugin adds a `/usage` command, and can price those calls with your own price list. Install `@tanstack/ai-models` for the prices:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-models
vue: @tanstack/ai-models
solid: @tanstack/ai-models
svelte: @tanstack/ai-models
preact: @tanstack/ai-models
angular: @tanstack/ai-models
octane: @tanstack/ai-models
vanilla: @tanstack/ai-models

<!-- ::end:tabs -->

```ts group=harness-usage
import { usage } from '@tanstack/ai-harness/plugins'
import { getModel } from '@tanstack/ai-models'

export const priced = defineHarness({
  name: 'acme/priced',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [usage({ model: (id) => getModel('openai', id) })],
})
```

`/usage` reads `session.usage()` and shows the total. When the thread used more than one model, it also shows a line for each model:

```text
3 model calls, 41200 input tokens (30000 cache read, 0 cache write), 2100 output tokens, 43300 total. Cost: $0.0432.
openai/gpt-6.1-sol: 2 model calls, 40000 input tokens (30000 cache read, 0 cache write), 2000 output tokens, 42000 total.
openai/gpt-6-luna: 1 model calls, 1200 input tokens, 100 output tokens, 1300 total.
```

How the plugin finds the cost:

- A call with a cost from its provider keeps that cost, as it is.
- `model` prices only the calls with no provider cost. It gets the model id without the provider, like `gpt-6.1-sol`. It returns `{ cost }` with prices in USD per 1M tokens, or `undefined`.
- Without `model`, `/usage` shows `Cost:` only when a provider reported a cost.
- A call with no price adds a note, for example `(cost unknown for 1 call)`.

`session.usage()` keeps only the costs that the providers report. The prices of `model` show in `/usage` and in the session index.

## Show the cost in a list of sessions

With `stores.sessions`, each [session index](./sessions) entry has a `usage` field:

- The host writes the token counts of `session.usage()` at the end of each turn. `turns` is the number of model calls.
- The `usage()` plugin writes `usage.cost` whenever it has a cost: the provider costs plus the prices of `model`.

Read them in the browser with `listSessions`:

```ts group=harness-usage-client
const page = await client.listSessions({ limit: 20 })
for (const entry of page.entries) {
  const cost = entry.usage?.cost
  console.log(entry.title ?? 'New chat', cost === undefined ? '' : `$${cost.toFixed(2)}`)
}
```

## Show a context meter

The plugin state, `state.plugins['tanstack/usage']`, has a copy of `session.usage().total` and one more field:

- `contextTokens`: the input tokens of the latest call of the lead model. This is how much of the context window the conversation fills now.

Compare `contextTokens` with the context window of the model, and show the result as a meter in [your own UI](./custom-ui).

## Known limits

- A host with no `usage()` plugin writes no cost to the index entry. The token counts are still there.
- On a host with a log, the cost in the index entry and the state copy can miss the last call of a run. They get it at the end of the next run.
- A background agent can end after the turn. Then the index entry counts its tokens at the end of the next turn.
- For one model, when some calls have a provider cost and others do not, `model` does not price the others.
- `model` uses the base prices only. Higher prices for a long input, like the `tiers` of `@tanstack/ai-models`, do not apply.

## What you have now

- The tokens and the cost of a thread, in total, by model, and by sender.
- Totals that stay after a restart.
- A live total in your UI, from the `harness.usage` event.
- A budget check before each prompt.
- `/usage` with your own prices, a cost for each session in the session index, and a context meter.
