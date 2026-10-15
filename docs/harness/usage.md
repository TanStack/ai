---
title: Track usage and cost
id: harness-usage
order: 7
description: "Read the tokens and the cost of a thread, in total, by model, and by sender. Show a live total, and stop a person who is over budget."
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

A call that fails before it ends does not count. Each message runs as its sender, so in a [shared thread](./shared-threads), `bySender` shows what each person used.

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

## What you have now

- The tokens and the cost of a thread, in total, by model, and by sender.
- Totals that stay after a restart.
- A live total from the `harness.usage` event.
- A budget check before each prompt.
- The token counts of each session in the session index.
