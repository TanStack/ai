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

Some computer actions are risky. The page can ask the model to do a thing the user did not ask for, or the action can send data. OpenAI attaches safety checks to these actions. The run pauses, and a person approves or declines the action.

## How it works

1. The model sends a computer call with `pending_safety_checks`.
2. The `middleware` pauses the run with one interrupt for each call that has checks.
3. A person approves or declines on the client.

- If the person approves all calls, the calls run. The checks go back to OpenAI as acknowledged.
- If the person declines one call, no call of that turn runs.
- A call with checks that nobody approved does not run. The tool refuses it.

Safety checks are an OpenAI feature. Anthropic models do not send them, so this code does nothing on Anthropic.

## Server

Give `middleware` and `interrupt` to `chat()`. Also pass `parentRunId` and `resume`, so that the approval can continue the run.

```ts
// app/api/chat/route.ts
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { computerFor } from './computers'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const { tool, middleware, interrupt } = await computerFor(params.threadId)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
    ...(params.resume ? { resume: params.resume } : {}),
    tools: [tool],
    middleware: [middleware],
    interrupts: [interrupt],
  })
  return toServerSentEventsResponse(stream)
}
```

`computerFor` returns the same `createComputerUse` result for each thread. The approval is stored on that result, so the continuation must use the same one. [Computer Use](./computer-use) shows `computerFor`.

## Client

Register `computerSafetyCheck` with `useChat`. Each item has these fields:

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

## Try it

Ask the model to do a task that sends data, for example a form submit. When OpenAI adds a safety check, the card shows. Click **Approve**, and the action runs. Click **Decline**, and the page stays as it was.
