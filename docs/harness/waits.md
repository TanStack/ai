---
title: Wait for a person
id: harness-waits
order: 5
description: "Stop a run until a person approves a tool call, answers a question, or signs in. The session log keeps the wait, so any server can take the answer, also after a restart, and the wait can expire."
keywords:
  - tanstack ai
  - harness
  - waits
  - approvals
  - step.ask
  - human in the loop
  - expiresAt
---

Your agent needs a person before it can go on: a yes for a refund, the amount, a sign-in. A person can take a minute or a day. In that time the server can restart, and the answer can reach another instance. In a harness, each of these is a wait. The session log keeps it, so no process holds it, any instance can take the answer, and it can expire.

## 1. Ask from a tool

Call `step.ask` in a [durable tool](./durable-tools). This tool asks for the amount of a refund, then pays it once:

```ts group=harness-waits
import { toolDefinition } from '@tanstack/ai'
import { createHarnessHost, defineHarness, durableTool } from '@tanstack/ai-harness'
import { openaiText } from '@tanstack/ai-openai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'

declare const payments: {
  refund: (orderId: string, amount: number) => Promise<{ id: string }>
}

const refund = durableTool(
  toolDefinition({
    name: 'refund',
    description: 'Refund an order',
    inputSchema: z.object({ orderId: z.string() }),
  }),
  async ({ orderId }, { step }) => {
    const amount = await step.ask({
      name: 'amount',
      message: `How much do we refund for ${orderId}?`,
      schema: z.number().positive(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    })
    const paid = await step.do(`refund:${orderId}`, () =>
      payments.refund(orderId, amount),
    )
    return { refundId: paid.id }
  },
)

const support = defineHarness({
  name: 'acme/support',
  adapter: openaiText('gpt-6.1-sol'),
  tools: [refund],
})
```

- `name` identifies the question in this call. Use the same name on every run of the code.
- The session checks the answer against `schema`. Here `amount` is a `number`.
- `expiresAt` ends the wait if nobody answers in time. Then `step.ask` rejects. Without it, the wait has no time limit.
- `secret: true` asks for a key or a password. The log never keeps that answer.

When the host stops while the tool waits, the next host runs the tool again from the top. `step.ask` then returns the logged answer, or waits again. A finished `step.do` returns its stored value, so the refund runs once.

## 2. Find the wait

`session.waitFor` resolves with the first wait of a run:

```ts group=harness-waits
const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(support, { threadId: 'ticket-7' })

const turn = session.send('Refund order A-17.')
const wait = await session.waitForRun({
  runId: turn.id,
  signal: AbortSignal.timeout(60_000),
})
console.log(wait.kind, wait.message) // question How much do we refund for A-17?
```

- Without `runId`, it resolves with the first wait of the session.
- `session.snapshot().pendingWaits` lists every open wait, oldest first. A wait that a chat run stopped for has its `interrupt`. A wait of the stopped turn has `turn: true`.
- A wait of an agent that the model calls as a tool has the `agent` name and the `subagentRunId` of that agent run. See [When an agent tool waits](./subagents#when-an-agent-tool-waits).

Each wait has a `kind`:

| Kind | The run waits for |
| --- | --- |
| `approval` | A yes or a no for a tool call. |
| `question` | An answer that fits the `schema` of the wait: from `step.ask`, the `question` tool, or an MCP server. |
| `sign-in` | The user signs in to a connector. |
| `client-tool` | The output of a tool that runs in the client. |
| `human` | A person who takes over, from an interrupt of `defineInterrupt`. |

`waitKind(interrupt)` and `isApproval(interrupt)` give the kind of the `interrupt` of a wait too. Import them from `@tanstack/ai-harness`.

## 3. Answer it

```ts group=harness-waits
const hasInterrupt = session
  .snapshot()
  .pendingWaits.some(
    (open) => open.waitId === wait.waitId && open.interrupt !== undefined,
  )

if (hasInterrupt) {
  await session.resolve({
    resume: [{ interruptId: wait.waitId, status: 'resolved', payload: true }],
  })
} else {
  await session.answer({ questionId: wait.waitId, value: 40 })
}
await turn
```

The tool pays 40 and the turn finishes. Two inputs answer waits:

- `answer`: a wait with no `interrupt`: a `step.ask` question (of a durable tool, a command, or a background agent run), a question of an MCP server, and the `human` wait of a handoff. It checks the answer against the `schema` of the wait, and keeps a secret answer out of the log.
- `resolve`: a wait with an `interrupt`: a wait that a turn stopped for (an approval, the `question` tool, a client tool, a sign-in, a wait of an [agent tool](./subagents#when-an-agent-tool-waits)), and a wait of a [background agent run](./subagents#when-a-background-agent-waits). One `resolve` answers every wait of the stopped turn, or waits of one background run. A `resolve` of a wait with no `interrupt` is refused with `use_answer`.

Both are inputs. An answer that reaches another instance waits in the log until the owner takes it. `host.submit` stores an answer for a thread that has no open session.

## How a wait ends

Each wait ends with one outcome:

- `answered`: someone answered it.
- `cancelled`: the run stopped, or the `signal` of the question aborted.
- `expired`: `expiresAt` passed with no answer.

Only a `sign-in` wait has a default time limit: 15 minutes. The other kinds wait until someone answers, unless you set `expiresAt`. An interrupt of a turn with an `expiresAt` also ends on time.

`session.waitFor` and `session.settled` take a `signal` too. It stops your own wait for the session. It does not end the wait of the run.

## Where a run can wait

A run waits for a person only at these points:

1. Before a tool call. [`permissions()`](./permissions) opens one approval wait for each call that asks.
2. The `question` tool. The model asks the user to pick an option.
3. `step.ask` in a durable tool, in a command, in an agent run that started with `runAgainAfterCrash: true`, or in an agent that the model calls as a tool.
4. Live waits: an MCP server that asks during a tool call (elicitation), and an OAuth sign-in. The host that runs the call keeps the thread until the answer comes. See [Answer a question from a server](./mcp#answer-a-question-from-a-server).

`ctx.session.ask` in your own plugin throws an error that names these points. A command that called `step.ask` runs again from the top after a host stop, so put each side effect before the ask in `step.do`.

## Who can answer

On a host with [`access`](./access), its `rules` decide each answer:

- An answer is the `answer` action. With [`membersOnly()`](./shared-threads), the owner of the session and the user who started the run have it.
- A `human` wait takes only the `operator` action. With `membersOnly()`, only members with the role `operator` have it. The owner does not. To change that, pass `membersOnly({ operator: { roles } })`. See [Shared threads](./shared-threads).

## What you have now

- A refund that waits for a person, on any instance, and pays once.
- One list of everything that waits, with a kind for each item.
- Waits that expire on time, and that a restart does not lose.

To show waits in your own screen, see [Build your own UI](./custom-ui).
