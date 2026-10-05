---
title: Control how a turn ends
id: harness-turn-control
order: 4
description: "Send the model back to work when it stops too soon, retry model errors, choose which waiting messages join a running turn, and give one prompt its own model and tools."
keywords:
  - tanstack ai
  - harness
  - beforeFinish
  - onModelError
  - retry
  - canJoin
  - onJoin
  - steer
  - overrides
  - TurnOverrides
---

A model can stop before the job is done: it writes a nice answer and forgets to call `post_message`. A provider can answer 503 in the middle of a turn. A user can send three messages while the agent works, and one of them must not join. The `turn` options of the harness give you a hook for each case.

One job can also need its own model or tools. Pass `overrides` to the prompt to [give it its own settings](#give-one-prompt-its-own-settings).

## Send the model back to work

The `beforeFinish` hook runs when the model stops calling tools. Check the transcript. If the job is not done, return a message. The model runs again in the same operation.

```ts group=harness-turn-control
import { defineHarness } from '@tanstack/ai-harness'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-5.6'),
  turn: {
    beforeFinish: ({ messages }) => {
      const posted = messages.some((message) =>
        message.toolCalls?.some((call) => call.function.name === 'post_message'),
      )
      if (posted) return undefined
      return {
        messages: [
          {
            role: 'user',
            content: 'You have not called post_message yet. Call it now.',
          },
        ],
      }
    },
  },
})
```

- The hook returns `{ messages?, records? }`. Return nothing when the work is done, and the turn ends.
- When the return changes the transcript, the model runs again. The hook runs again at the next stop.
- Always check `messages`. A hook that returns the same reminder every time never stops.
- `maxFinishCycles` (default 32) is the limit. A hook that still asks for more at the limit fails the turn.
- `records` are host records in the same append. They need a durable host. See [Append your own records](./session-log#append-your-own-records).

## Retry model errors

A model call can fail for a reason that passes in a few seconds: an overloaded provider, a rate limit, a dropped connection. Set `onModelError` to `retryTransientErrors()`. The harness runs the failed call again in the same operation.

```ts group=harness-turn-control
import { retryTransientErrors } from '@tanstack/ai-harness'

const resilient = defineHarness({
  name: 'acme/resilient',
  adapter: openaiText('gpt-5.6'),
  turn: { onModelError: retryTransientErrors() },
})
```

The defaults:

- `maxRetries`: 3 retries since the last finished tool phase.
- `baseDelayMs`: 2000. The delay doubles with each retry. Each delay is then multiplied by a random jitter from 0.75 to 1.0.
- `isTransient`: `isTransientModelError`. It is true for 429, 5xx, overloaded, rate limit, network and connection errors, and timeouts.

Pass your own check when you know more about your provider:

```ts group=harness-turn-control
import { isTransientModelError } from '@tanstack/ai-harness'

const picky = defineHarness({
  name: 'acme/picky',
  adapter: openaiText('gpt-5.6'),
  turn: {
    onModelError: retryTransientErrors({
      maxRetries: 5,
      baseDelayMs: 500,
      isTransient: (error) =>
        error.code === 'upstream_busy' || isTransientModelError(error),
    }),
  },
})
```

Clients get a `harness.turn.retry` event for each retry. The text of the failed call is not in the turn result.

### Compact after a context overflow

`onModelError` is a plain function, so you can write your own policy. For a context overflow, use the [compaction middleware](../advanced/compaction): call `compactNext`, then retry once.

```ts group=harness-turn-control
import { isContextOverflow } from '@tanstack/ai'
import { withCompaction } from '@tanstack/ai-compaction'

const compaction = withCompaction({ maxTokens: 100_000, countTokens: 'usage' })

const compacting = defineHarness({
  name: 'acme/compacting',
  adapter: openaiText('gpt-5.6'),
  middleware: [compaction],
  turn: {
    onModelError: ({ session, error, retries }) => {
      if (retries > 0 || !isContextOverflow({ error: error.message })) {
        return undefined
      }
      compaction.compactNext(session.threadId)
      return 'retry'
    },
  },
})
```

The retried call compacts before it calls the model. To keep the compaction after a restart, see [Compact a harness session](./compaction).

## Choose which messages join a turn

A message with `busy: 'steer'` waits while a turn runs. Before each model call, the waiting messages join the turn as a prefix, in the order they arrived.

The join stops at the first message that:

- has an abort request (`session.cancel(operationId)` on it), or
- `turn.canJoin` refuses.

That message and the ones after it wait. `canJoin` runs again before each model call and at each final answer, so it can run more than once for one message. Keep it a quick check with no side effects. What still waits when the turn ends runs as its own turn, before other queued turns. A cancelled one settles `aborted` and does not run.

A joined message runs with the credentials of the sender of the turn. So without `turn.canJoin`, a waiting message joins the running turn only when the same person sent both. A message from another person waits and runs as its own turn after the running one, as its sender. Joins are a prefix, so it also holds back the messages that wait after it. Set `canJoin` to choose your own rule. See [Keep other people out of a running turn](./shared-threads#3-keep-other-people-out-of-a-running-turn).

`onJoin` runs before the model call that the joined messages reach. It can return messages, which come after the joined ones, and records, which land in the same append as the join. Records need a durable host.

- If `onJoin` throws, the turn fails, and those messages run as their own turns.
- If you cancel the turn while `onJoin` runs, the hook adds nothing to it, and those messages run as their own turns.

```ts group=harness-turn-control
const selective = defineHarness({
  name: 'acme/selective',
  adapter: openaiText('gpt-5.6'),
  turn: {
    canJoin: ({ message }) =>
      typeof message === 'string' && message.length <= 500,
    onJoin: ({ inputs }) => ({
      messages: [
        {
          role: 'user',
          content: `${inputs.length} new message(s) arrived. Answer them before you continue.`,
        },
      ],
      records: [{ type: 'app.join', count: inputs.length }],
    }),
  },
})
```

Tools or system prompts that a plugin or a middleware adds during a turn keep the prompt cache on models with a mid-conversation channel. See [Mid-conversation changes in a harness](../advanced/mid-conversation-changes#in-a-harness).

## Give one prompt its own settings

Most prompts are fine with the harness settings. One job can need more: a stronger model for a review, more reasoning, or a tool that only this job uses. Pass `overrides` to `session.prompt` or `session.followUp`:

```ts group=harness-turn-control
import { toolDefinition } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { createHarnessHost } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'

const readDiff = toolDefinition({
  name: 'read_diff',
  description: 'Read the diff of the open pull request',
}).server(async () => 'diff --git a/src/cart.ts b/src/cart.ts')

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(resilient, { threadId: 'thread-1' })

const review = await session.prompt('Review the open pull request.', {
  overrides: {
    adapter: anthropicText('claude-opus-5-5'),
    reasoning: 'high',
    tools: [readDiff],
  },
})
console.log(review.text)
```

The overrides apply to this turn only. The next prompt without `overrides` uses the harness settings again. The type is `TurnOverrides`, from `@tanstack/ai-harness`.

| Field | What it does in this turn |
|---|---|
| `adapter` | Replaces the harness adapter and every plugin pick. A keyed adapter uses the key of the user. |
| `reasoning` | Replaces the `reasoning` of the harness. |
| `promptCache` | Replaces the session and harness values, field by field. `{ key: 'review' }` keeps the session retention. |
| `tools` | Adds tools to the tools of the harness and the plugins. |

Every model call of the turn uses the overrides:

- each step of the tool loop
- each `onModelError` retry
- each `beforeFinish` cycle
- the main model after a [`routing`](./subagents#route-a-turn-to-an-agent) handoff
- the extra model call for steer messages that arrive at the final answer

### Tools for one turn

- A tool name that the turn already has fails the turn, the same as two tools with one name.
- A [durable tool](./durable-tools) gets `step` and `append` on a durable host.
- A middleware `onConfig` that returns a new tool list does not drop these tools. The harness adds them back.

### Where the overrides live

The session keeps the overrides in memory only. The session log does not store them.

- A queued prompt keeps its overrides until its turn runs.
- A steer that joins a running turn uses the overrides of that turn. The session ignores the overrides of the steer.
- A `prompt(text, { busy: 'steer', overrides })` that does not join runs as its own turn, with its own overrides.
- After a restart, recovery runs an unfinished turn with the harness settings.
- A second prompt with the same `inputId` and message is a duplicate, also when its overrides are different.

To keep a model or instructions for every turn of a thread, also after a restart, store them with `session.configure`. See [Store settings per thread](./thread-settings).

## What you have now

- A turn that goes back to work until the job is done, with a limit.
- Model errors that retry with a backoff, and a policy of your own for a context overflow.
- Waiting messages that join a turn only when you allow it.
- A prompt that runs with its own model, reasoning, prompt cache, and tools.
