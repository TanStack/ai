---
title: Computer Use Safety Checks
id: computer-use-safety-checks
order: 3
description: "Pause a computer action until a person approves it. OpenAI attaches safety checks to risky actions, and TanStack AI turns each one into an interrupt."
keywords:
  - tanstack ai
  - computer use
  - safety checks
  - pending_safety_checks
  - computerSafetyCheck
  - interrupt
  - approval
---

A safety check runs before a computer action. It blocks an action the user did not ask for, or an action that sends data.

OpenAI attaches safety checks to these actions. TanStack AI pauses the run, and a person approves or declines the action. This page adds the approval card to your [computer use](./computer-use) app.

## 1. Add the server route

Give `tools`, `middleware`, and `interrupt` to `chat()`. Also give `parentRunId` and `resume`, so that the approval can continue the run.

```ts
// app/api/chat/route.ts
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createComputerUse } from '@tanstack/ai-computer-use'
import { playwrightComputer } from '@tanstack/ai-computer-playwright'

const computerUse = createComputerUse({
  driver: playwrightComputer({ startUrl: 'https://tanstack.com' }),
  // A person has up to one hour to answer before the page closes.
  idleTimeout: 60 * 60_000,
})

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
    ...(params.resume ? { resume: params.resume } : {}),
    tools: computerUse.tools,
    middleware: [computerUse.middleware],
    interrupts: [computerUse.interrupt],
  })
  return toServerSentEventsResponse(stream)
}
```

## 2. Show the approval card

Register `computerSafetyCheck` with `useChat`. Then show a card for each paused action. Each interrupt has these fields:

- `payload.checks`: the safety checks. Each check has an `id`, and can have a `code` and a `message`.
- `payload.action`: the action that waits. For a batch, this is the list of actions.

```tsx
// app/chat.tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { GenericInterrupt } from '@tanstack/ai-react'
import { computerSafetyCheck } from '@tanstack/ai-computer-use'

function SafetyCheckCard({
  interrupt,
}: {
  interrupt: GenericInterrupt<typeof computerSafetyCheck>
}) {
  const checks = interrupt.payload?.checks ?? []
  return (
    <article>
      <h2>Approve this computer action?</h2>
      <ul>
        {checks.map((check) => (
          <li key={check.id}>{check.message ?? check.code ?? check.id}</li>
        ))}
      </ul>
      <pre>{JSON.stringify(interrupt.payload?.action, null, 2)}</pre>
      <button onClick={() => interrupt.resolveInterrupt({ approved: true })}>
        Approve
      </button>
      <button onClick={() => interrupt.resolveInterrupt({ approved: false })}>
        Decline
      </button>
    </article>
  )
}

export function Chat() {
  const { interrupts } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
    interrupts: [computerSafetyCheck],
  })

  return (
    <>
      {interrupts.map((interrupt) => {
        if (interrupt.kind !== 'generic') return null
        if (!('definitionId' in interrupt)) return null
        if (interrupt.definitionId !== computerSafetyCheck.id) return null
        return <SafetyCheckCard key={interrupt.id} interrupt={interrupt} />
      })}
    </>
  )
}
```

`interrupt.cancel()` also declines the action. When every interrupt of the batch has an answer, the client sends the answers. For more about generic interrupts, see [Generic Interrupts](../interrupts/generic).

## 3. Try it

Ask the model to do a task that sends data, for example a form submit. When OpenAI adds a safety check, the card shows.

- Click **Approve**, and the action runs.
- Click **Decline**, and the page stays as it was.

## How it works

1. The model sends a computer call with `pending_safety_checks`.
2. The `middleware` pauses the run with one interrupt for each call that has checks.
3. A person approves or declines on the client.

After the answer:

- If the person approves all calls, the calls run. The checks go back to OpenAI as acknowledged.
- If the person declines one call, no call of that turn runs.
- A call with checks that nobody approved does not run. The tool refuses it.

Safety checks are an OpenAI feature. Anthropic models do not send them, so this code does nothing on Anthropic.

## Advanced

### Keep the approval until the resume request

`computerUse` keeps the approval for the thread until the resume request comes. To keep it there:

- Create `computerUse` one time, at module scope. Every request uses the same one.
- Give `params.threadId` to `chat()`. The resume request has the same thread id as the request that paused.
- Set `idleTimeout` above the time that a person takes to answer. If the time ends first, the page closes, and the approved action runs on a new page.
- Send the resume request to the same server process. The approvals live in the memory of that process.
