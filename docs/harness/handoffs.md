---
title: Hand off a conversation
id: harness-handoffs
order: 14
description: "Let one agent hand the conversation to another agent, to a person, or to another harness. Only the data that you name moves with it."
keywords:
  - tanstack ai
  - harness
  - handoff
  - transfer
  - operator
  - human in the loop
  - activeAgent
---

A user asks your support agent for a refund. The support agent cannot do refunds, but your billing agent can. Then the user wants a person, and a person from your team must take over. Later, the whole case must move to the harness of another team.

A handoff moves the conversation to another agent or to a person. A transfer moves it to another thread, also of another harness. In both cases, control moves on purpose, and only the data that you name moves with it.

## 1. Let agents hand off

Give the harness its root agents and `routing`. A router that returns `undefined` lets the agent that answers now keep the turn:

```ts group=harness-handoffs
import { defineAgent } from '@tanstack/ai'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const billing = defineAgent({
  name: 'billing',
  description: 'Handles refunds, invoices, and payments',
  run: (ctx) =>
    ctx.chat({
      adapter: openaiText('gpt-6.1-sol'),
      systemPrompts: ['You handle refunds, invoices, and payments.'],
    }),
})

export const support = defineHarness({
  name: 'acme/support',
  adapter: openaiText('gpt-6.1-sol'),
  systemPrompts: ['You are the support desk. Hand billing questions to billing.'],
  agents: [billing],
  routing: { router: () => undefined },
})

export const host = createHarnessHost({ persistence: memoryPersistence() })

export async function ask(threadId: string, text: string) {
  const session = await host.open(support, { threadId })
  return session.send(text)
}
```

Send `I want a refund for order 42.` The main model calls its `handoff` tool with `{ to: 'billing', note }`. Then billing answers in the same turn. The turn text is `billing:\n...`.

What the handoff does:

- The log keeps the active agent. Later turns go to billing until it hands off again, or until the router picks another agent.
- The main model and each root agent get a `handoff` tool. Its `to` lists the root agents. A root agent can also hand back to `'main'`, the main model.
- One turn can hand off 10 times at most.
- An agent that is only in `subagents` cannot be a target. A child that an agent starts cannot hand off either.
- If the app has its own tool named `handoff`, the turn fails with a duplicate tool error. Set `routing: { router, giveModelsHandoffTool: false }` to give no model the `handoff` tool. The router and your code can still hand off.

## 2. Hand off from code

An agent can decide in code. In a root agent that answers a turn, call `ctx.harness.handoff`:

```ts group=harness-handoffs
export const triage = defineAgent({
  name: 'triage',
  description: 'Sorts new requests',
  run: async (ctx) => {
    if (!ctx.harness) throw new Error('This agent must run in a harness.')
    await ctx.harness.handoff({ to: 'billing', note: 'Refund for order 42' })
    return 'I pass you to billing.'
  },
})
```

A tool of the main model uses `ctx.context.run.handoff`. Type the tool with `HarnessRunContext`:

```ts group=harness-handoffs
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import type { HarnessRunContext } from '@tanstack/ai-harness'

export const escalate = toolDefinition({
  name: 'escalate',
  description: 'Send the user to billing',
  inputSchema: z.object({ orderId: z.string() }),
}).server<HarnessRunContext>(async ({ orderId }, ctx) => {
  await ctx.context.run.handoff({ to: 'billing', note: `Refund for order ${orderId}` })
  return 'Billing answers next.'
})
```

- The part that handed off ends. Then the target answers, in the same turn.
- Outside a turn of a harness with `routing`, both calls reject.
- A target that is not a root agent rejects, and the agent that called it keeps the turn.

The router can hand off too. Return `{ handoff: 'billing', note }` from `routing.router`. See [Route a turn to an agent](./subagents#route-a-turn-to-an-agent).

## What the target gets

- Its own system prompts and tools. The tools of the agent that handed off do not go with it.
- The saved transcript of the thread, the same messages that the members see.
- The note, in the transcript, in the log, and in the `harness.handoff` event.
- The provider keys of the user who sent the turn.

The `handoff` tool call of a model is in the transcript already. A handoff from the router or from code adds the same two messages before the target answers:

- An assistant message with a `handoff` tool call. Its arguments are `{ to, note }`.
- The tool result, for example `Handed off to billing. billing answers next.`

Both messages have `metadata.harness.handoff.by` (`'router'` or `'code'`). When an agent handed off, they also have its name in `metadata.harness.agent`. The messages go after the messages that the earlier model call got, so the prompt cache of the provider still holds.

With `routing.giveModelsHandoffTool: false`, the models have no `handoff` tool. Then the harness adds one assistant message with the same text and the note.

The `agents()` plugin has its own primary agent, its `agent` config and `/agent`. That one changes the prompt and the tools of the main model. A handoff does not change it, and it does not change the active agent. See [Switch between agent profiles](./agents).

## 3. Show who answers

Each message that an agent writes has its name in `metadata.harness.agent`. In the [session view](./custom-ui), an assistant message has `agent`. It is `undefined` for the main model:

```tsx ignore
import { useSelector } from '@tanstack/react-store'
import { createHarnessClient } from '@tanstack/ai-harness/client'
import { createSessionView } from '@tanstack/ai-harness/view'

const view = createSessionView(
  createHarnessClient({ url: '/api/harness', threadId: 'user-1-thread' }),
)

export function Messages() {
  const messages = useSelector(view.store, (state) => state.messages)
  return messages.map((message) =>
    message.role === 'assistant' ? (
      <p key={message.id}>
        <strong>{message.agent ?? 'Support'}: </strong>
        {message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('')}
      </p>
    ) : null,
  )
}
```

Each handoff also streams a `CUSTOM` event named `harness.handoff` (`HARNESS_EVENTS.handoff`). Its value has these fields:

- `from` and `to`: an agent name, `null` for the main model, or `{ human: true }` for a person.
- `note`: the note, when there is one.
- `by`: `'tool'`, `'code'`, `'router'`, or `'operator'`.
- `runId`: the turn. A handoff to a person also has `waitId`.

## 4. Hand off to a person

Some users need a person. Set `routing.allowHandoffToHuman: true`. Then the `handoff` tool also takes `{ human: true }`:

```ts group=harness-handoffs
import { membersOnly } from '@tanstack/ai-harness'
import { createHarnessHandler } from '@tanstack/ai-harness/server'

export const desk = defineHarness({
  name: 'acme/desk',
  adapter: openaiText('gpt-6.1-sol'),
  systemPrompts: ['If the user asks for a person, hand off to { human: true }.'],
  agents: [billing],
  routing: { router: () => undefined, allowHandoffToHuman: true },
})

// Your own login check: a session token to a user.
const users = new Map([
  ['Bearer token-ada', { id: 'ada', tenantId: 'acme' }],
  ['Bearer token-olga', { id: 'olga', tenantId: 'acme' }],
])

export const deskHost = createHarnessHost({
  persistence: memoryPersistence(),
  access: {
    getUser: ({ request }) => users.get(request.headers.get('authorization') ?? '') ?? null,
    rules: membersOnly(),
  },
})

export const handler = createHarnessHandler({ host: deskHost, harness: desk })
```

When an agent hands off to a person:

- The handoff opens a `human` wait. The note is its `message`. The wait does not expire.
- The turn ends `interrupted`, and the session pauses.
- A user message during the pause goes into the transcript. No model answers it.

`ctx.harness.handoff({ to: { human: true } })` and `run.handoff` work the same way. Without `routing.allowHandoffToHuman`, a handoff to a person rejects.

### Reply as the operator

A person from your team replies with `as: 'operator'`:

1. Share the thread with the operator, with the role `operator`. Ada owns the thread here. See [Share a thread between people](./shared-threads#2-share-the-thread).
2. Send the reply as the operator.

```ts group=harness-handoffs
const ada = { id: 'ada', tenantId: 'acme' }
const olga = { id: 'olga', tenantId: 'acme' }

export async function addOperator(threadId: string) {
  await deskHost.sessions.share({ threadId, userId: 'olga', role: 'operator', user: ada })
}

export async function reply(threadId: string, text: string) {
  const session = await deskHost.open(desk, { threadId, user: olga })
  await session.send(text, { as: 'operator' })
}
```

- The reply goes into the transcript as an assistant message, with `metadata.harness.operator` set to the id of the operator. No model runs.
- The sender needs the `operator` access action. With `membersOnly()`, only the role `operator` has it. The owner and members do not, so the user who waits cannot act as the person. To change this, pass `membersOnly({ operator: { roles: ['owner', 'operator'] } })`.
- Files in the reply go into a user message after it, because a model takes files only from a user. `metadata.harness.operatorAttachment` marks it, and a view shows the files with the reply.
- Without an open `human` wait, the receipt is `rejected` with `no_human_wait`.

In the browser, the operator uses the same option: `client.send(text, { as: 'operator' })`, or `view.send(text, { as: 'operator' })` in a [session view](./custom-ui). The reply shows in each open view at once.

### End the pause

The operator ends the pause with an answer to the `human` wait:

```ts group=harness-handoffs-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import type { desk } from './harness'

const client = createHarnessClient<typeof desk>({
  url: '/api/desk',
  threadId: 'case-42',
  headers: { authorization: 'Bearer token-olga' },
})

const snapshot = await client.snapshot()
const wait = snapshot.pendingWaits.find((open) => open.kind === 'human')
if (wait) {
  await client.answer({ questionId: wait.waitId, value: { handBack: 'billing' } })
}
```

- `{ resume: true }` gives the thread back to the agent that answered before the handoff.
- `{ handBack: 'billing' }` gives it to that agent. `{ handBack: 'main' }` gives it to the main model.
- Any other value is `rejected` with `invalid_answer`. An unknown agent is `rejected` with `unknown_agent`.
- The wait can also end with `session.resolve` or a cancel. Then the agent that answered before the handoff gets the thread back. Each of these needs the `operator` action.
- The answer starts no turn. The held user messages wait for the next message, or for `session.continueWithoutMessage()`.

## 5. Move a conversation to another harness

The case must leave the support harness. The billing team runs its own harness, with its own tools and plugins. `host.transfer` makes a new thread under the target harness and copies only the envelope:

```ts group=harness-handoffs
export const billingDesk = defineHarness({
  name: 'acme/billing',
  adapter: openaiText('gpt-6.1-sol'),
})

export const billingHandler = createHarnessHandler({ host: deskHost, harness: billingDesk })

// Mount on POST /api/move-to-billing?threadId=...
export async function moveToBilling(request: Request) {
  const user = await deskHost.getUserOfRequest({ request })
  if (!user) return new Response('Unauthorized', { status: 401 })
  const threadId = new URL(request.url).searchParams.get('threadId')
  if (!threadId) return new Response('Missing threadId', { status: 400 })
  const result = await deskHost.transfer({
    from: { harness: desk, threadId },
    to: { harness: billingDesk },
    envelope: { note: 'Refund for order 42. The user waits.', messages: 'summary' },
    user,
    transferId: `refund-${threadId}`,
  })
  return new Response(result.threadId)
}
```

`envelope.note` is the first message of the target. `envelope.messages` picks what comes after it:

- `'none'` (default): no message.
- `'summary'`: one summary message. The model of the source harness writes it, with the keys of the user. The summary call stops after 2 minutes, and then the transfer fails. Its usage counts in the source thread under the source `transfer`. See [Usage of the router and transfers](./usage#usage-of-the-router-and-transfers).
- `'all'`: the settled transcript, with new message ids and a copy of each media file.

Only settled messages move. A tool call with no result yet stays behind. Plugin state, shared state, credentials, waits, settings, and plugin config never move. The source thread keeps running.

The browser then opens the target thread on the handler of the target harness:

```ts group=harness-handoffs-client
import type { billingDesk } from './harness'

const response = await fetch('/api/move-to-billing?threadId=case-42', {
  method: 'POST',
  headers: { authorization: 'Bearer token-ada' },
})
const threadId = await response.text()

const billingClient = createHarnessClient<typeof billingDesk>({
  url: '/api/billing',
  threadId,
  headers: { authorization: 'Bearer token-ada' },
})
await billingClient.send('Hi, I am still here.')
```

### Rules of a transfer

- Both threads are in the tenant of `user`. A transfer to another tenant cannot be named.
- With access, the user needs `transfer` on the source. With `membersOnly()`, only the owner has it. A target that exists needs `send` too.
- A new target has the user as its only member, the owner. A thread that exists must belong to `to.harness`.
- A retry with the same `transferId` makes no second thread and copies nothing again.
- If another host owns the target log, the transfer throws `LogOwnedElsewhereError`.

How the two threads stay linked:

- Both logs get a `harness.transferred` record with the same `transferId`. See [Read the log](./session-log#read-the-log).
- The index entry of the target has `metadata['harness:transferredFrom']`. The source has `metadata['harness:transferredTo']`. The host writes these keys itself, and your `metadataSchema` does not check them.
- `host.events()` yields a `transferred` event. Copy your own access rows for the target there.

A [fork](./fork-and-reset) stays in its harness. `host.fork` with a thread of another harness throws, so use `host.transfer` for that move.

## What you have now

- Agents that hand the conversation to each other, from a tool, from code, or from the router.
- A log that keeps who answers, also after a restart.
- A UI that shows the name of the agent on each message.
- A pause for a person, operator replies, and a way to give the thread back.
- A conversation that moves to another harness with only the envelope that you name.
