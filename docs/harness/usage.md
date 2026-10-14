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
import { HARNESS_EVENTS, createHarnessHost, defineHarness } from '@tanstack/ai-harness'
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

A call that fails before it ends does not count. Each message runs as its sender, so in a thread that several people use, `bySender` shows what each person used.

## Where the totals live

The totals stay with the thread:

- A durable host (with `stores.log`) keeps one `harness.usage` record per call in the log. The log keeps the totals after a restart.
- Another host with `stores.metadata` keeps the totals there.
- A host with neither keeps them in memory.

A [fork of a thread](./fork-and-reset) starts at zero.

## Show a live total

Want a token counter that ticks up while the chat runs? Each model call sends a `harness.usage` event (`HARNESS_EVENTS.usage`) on the operation that made the call. Listen for it, then read the new totals:

```ts group=harness-usage
const stopCounting = session.onEvent('CUSTOM', ({ event }) => {
  if (event.name === HARNESS_EVENTS.usage) {
    console.log(`Tokens so far: ${session.usage().total.totalTokens}`)
  }
})

// When the counter goes away:
stopCounting()
```

The event value has the `model`, the `sender` when it is known, the `usage` of the call, and the new thread `total`.

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

Many providers report no cost, so `cost` can stay empty. For those, compare the token counts with a budget in tokens.

## Show the tokens in a list of sessions

With `stores.sessions`, each [session index](./sessions) entry has a `usage` field. The host writes the token counts of `session.usage()` at the end of each turn. `turns` is the number of model calls.

```ts group=harness-usage
const page = await host.sessions.list({ principal: { id: 'ada' }, limit: 20 })
for (const entry of page.entries) {
  console.log(entry.title ?? 'New chat', entry.usage?.totalTokens ?? 0)
}
```

A background agent can end after the turn. Then the index entry counts its tokens at the end of the next turn.

## Show usage and price the calls

Many providers report no cost, so `cost` stays empty. The `usage()` plugin adds a `/usage` command, and can price those calls with your own price list:

```ts group=harness-usage
import { usage } from '@tanstack/ai-harness/plugins'

// USD per 1M tokens, by model id.
const prices: Record<string, { input: number; output: number; cacheRead?: number }> = {
  'gpt-6.1-sol': { input: 2, output: 8, cacheRead: 0.2 },
}

export const priced = defineHarness({
  name: 'acme/priced',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [
    usage({
      model: (id) => {
        const cost = prices[id]
        return cost === undefined ? undefined : { cost }
      },
    }),
  ],
})
```

`session.command('usage')` reads `session.usage()` and shows the total. When the thread used more than one model, it also shows a line for each model:

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

The plugin also writes the cost to `usage.cost` of the session index entry, whenever it has one. `session.usage()` keeps only the costs that the providers report.

The plugin state, `snapshot().plugins['tanstack/usage']`, has a copy of `session.usage().total` and `contextTokens`: the input tokens of the latest call of the lead model. Compare it with the context window of the model to show how full the context is.

Limits of the plugin:

- For one model, when some calls have a provider cost and others do not, `model` does not price the others.
- On a host with a log, the cost in the index entry and the state copy can miss the last call of a run. They get it at the end of the next run.

## What you have now

- The tokens and the cost of a thread, in total, by model, and by sender.
- Totals that stay after a restart.
- A live total from the `harness.usage` event.
- A budget check before each prompt.
- The token counts of each session in the session index.
- `/usage` with your own prices, and a cost for each session in the session index.
