---
title: Interrupts and Approvals
id: interrupts-and-approvals
---

Use interrupt persistence when a run can pause for a human decision and resume
later without losing the stream, rerunning model work, or accepting new input
that forks around the pending choice.

## How durable interrupts work

With the `interrupts` feature, persistence stores:

- the run record in `stores.runs`,
- the public AG-UI event log in `stores.publicEvents`,
- pending waits in `stores.interrupts`.

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { withPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-sqlite'
import { sendEmail } from './tools'

const persistence = sqlitePersistence({
  path: '.tanstack-ai/state.sqlite',
})

export async function POST(request: Request) {
  const { messages, threadId, runId, cursor, resume } = await request.json()

  const stream = chat({
    threadId,
    runId,
    cursor,
    resume,
    adapter: anthropicText('claude-sonnet-4-6'),
    messages,
    tools: [sendEmail],
    middleware: [
      withPersistence(persistence, {
        features: ['interrupts'],
      }),
    ],
  })

  return toServerSentEventsResponse(stream)
}
```

Feature validation is fail-loud. If a custom backend omits one of the required
stores, the middleware throws during setup instead of silently dropping pending
waits.

## Resume with AG-UI `resume[]`

A user-actionable wait is represented in the public stream by
`RUN_FINISHED.outcome.type === 'interrupt'`. The client should collect the
pending interrupt ids, ask the user for a decision, then resume the same run
with AG-UI `RunAgentInput.resume[]` entries.

```ts
await chat.resumeInterrupts([
  {
    interruptId: 'send-email-approval',
    status: 'resolved',
    payload: { approved: true },
  },
])
```

Normal new input on the same thread is rejected by default while pending
interrupts exist. That keeps the server from accidentally creating a second
conversation branch before the existing decision has been resolved or
cancelled.

## Approval compatibility

Tool approvals are the common UI shape for interrupts. A tool with
`needsApproval: true` can pause the run, surface an approval request, and resume
after the user approves or denies it.

```ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const sendEmailDef = toolDefinition({
  name: 'send_email',
  description: 'Send an email to a recipient',
  inputSchema: z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.string(),
  }),
  needsApproval: true,
})

export const sendEmail = sendEmailDef.server(async ({ to, subject, body }) => {
  const response = await fetch('https://email.example.com/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to, subject, body }),
  })
  return { success: response.ok, messageId: crypto.randomUUID() }
})
```

Older approval-specific event projections remain compatibility behavior. New
durable flows should treat the interrupt outcome and `resume[]` payload as the
source of truth, then render approval UI as one way to collect the user's
response. For basic approval rendering without server persistence, see
[Tool Approval Flow](../tools/tool-approval).
