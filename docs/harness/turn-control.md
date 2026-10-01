---
title: Control how a turn ends
id: harness-turn-control
order: 4
description: "Send the model back to work when it stops too soon, retry model errors, and choose which waiting messages join a running turn."
keywords:
  - tanstack ai
  - harness
  - beforeFinish
  - onModelError
  - retry
  - canJoin
  - onJoin
  - steer
---

A model can stop before the job is done: it writes a nice answer and forgets to call `post_message`. A provider can answer 503 in the middle of a turn. A user can send three messages while the agent works, and one of them must not join. The `turn` options of the harness give you a hook for each case.

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

`onModelError` is a plain function, so you can write your own policy. This one handles a context overflow: it appends a compaction record, then retries once. Your host must have a `project` function that folds `app.compaction` records into the messages. See [Fold records into the model context](./session-log#fold-records-into-the-model-context).

```ts group=harness-turn-control
import { isContextOverflow } from '@tanstack/ai'

const compacting = defineHarness({
  name: 'acme/compacting',
  adapter: openaiText('gpt-5.6'),
  turn: {
    onModelError: async ({ session, error, retries }) => {
      if (retries > 0 || !isContextOverflow({ error: error.message })) {
        return undefined
      }
      await session.append([
        {
          type: 'app.compaction',
          summary: 'Earlier messages were removed to fit the context.',
          firstKept: -6,
        },
      ])
      return 'retry'
    },
  },
})
```

Here `firstKept: -6` keeps the last six messages. The `project` function in the linked page reads it with `messages.slice(record.firstKept)`, and `slice` counts a negative number from the end.

## Choose which messages join a turn

A message with `busy: 'steer'` waits while a turn runs. Before each model call, the waiting messages join the turn as a prefix, in the order they arrived.

The join stops at the first message that:

- has an abort request (`session.cancel(operationId)` on it), or
- `turn.canJoin` refuses.

That message and the ones after it run as their own turns later. A cancelled one settles `aborted`.

`onJoin` runs before the model call that the joined messages reach. It can return messages, which come after the joined ones, and records, which land in the same append as the join. Records need a durable host.

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

## What you have now

- A turn that goes back to work until the job is done, with a limit.
- Model errors that retry with a backoff, and a policy of your own for a context overflow.
- Waiting messages that join a turn only when you allow it.
