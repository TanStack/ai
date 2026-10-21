---
title: Tool Approval Flow
id: tool-approval-flow
order: 5
description: 'Make a tool wait for a yes from the user before it runs. Mark it with needsApproval, then show Approve and Deny buttons in your chat.'
keywords:
  - tanstack ai
  - tool approval
  - needsApproval
  - user consent
  - sensitive tools
  - approval flow
  - human-in-the-loop
---

Some tools must not run without a human saying yes: sending an email, making a purchase, deleting data. The model can plan the call, but a person must approve it first.

Add `needsApproval: true` to the tool. The run pauses before the tool runs. Your UI shows the call with Approve and Deny buttons. Then the run continues with the answer of the user.

## Add an approval

### 1. Mark the tool in a shared file

The server and the browser both import this definition:

```typescript
// tools/definitions.ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const sendEmailDef = toolDefinition({
  name: 'send_email',
  description: 'Send an email to a recipient',
  inputSchema: z.object({
    to: z.string(),
    subject: z.string(),
    body: z.string(),
  }),
  outputSchema: z.object({
    sent: z.boolean(),
  }),
  needsApproval: true,
})
```

### 2. Add the server function and forward the resume fields

The answer of the user arrives in a second request. Forward `parentRunId` and `resume`, so `chat()` can rebuild the paused call:

```typescript
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
  toolDefinition,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

// The same definition as tools/definitions.ts. In your app, import it from that file.
const sendEmailDef = toolDefinition({
  name: 'send_email',
  description: 'Send an email to a recipient',
  inputSchema: z.object({
    to: z.string(),
    subject: z.string(),
    body: z.string(),
  }),
  outputSchema: z.object({
    sent: z.boolean(),
  }),
  needsApproval: true,
})

const sendEmail = sendEmailDef.server(async ({ to, subject }) => {
  // This runs only after the user approves. Call your email service here.
  console.log(`Sending "${subject}" to ${to}`)
  return { sent: true }
})

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    parentRunId: params.parentRunId,
    ...(params.resume ? { resume: params.resume } : {}),
    tools: [sendEmail],
  })

  return toServerSentEventsResponse(stream)
}
```

### 3. Show the approval in your chat

Pass the definition to `useChat`, so `toolName` and `originalArgs` are typed. Pending approvals come in `interrupts`:

```tsx
// app/chat.tsx
import { useState } from 'react'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'
import { sendEmailDef } from '../tools/definitions'

export function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, interrupts, resuming } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    tools: [sendEmailDef],
  })

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) =>
            part.type === 'text' ? <p key={index}>{part.content}</p> : null,
          )}
        </div>
      ))}

      {interrupts.map((interrupt) =>
        interrupt.kind === 'tool-approval' ? (
          <div key={interrupt.id}>
            <p>Send this email?</p>
            <pre>{JSON.stringify(interrupt.originalArgs, null, 2)}</pre>
            <button
              disabled={!interrupt.canResolve || resuming}
              onClick={() => interrupt.resolveInterrupt(true)}
            >
              Approve
            </button>
            <button
              disabled={!interrupt.canResolve || resuming}
              onClick={() => interrupt.resolveInterrupt(false)}
            >
              Deny
            </button>
          </div>
        ) : null,
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void sendMessage(input)
          setInput('')
        }}
      >
        <input value={input} onChange={(event) => setInput(event.target.value)} />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
```

- `canResolve` is `false` until the interrupt is ready.
- `resuming` is `true` while an answer is on its way to the server.

Disable the buttons on both.

### 4. Try it

Ask your chat "Email ada@example.com and say hello." The Approve and Deny buttons show the email.

- Click **Approve**. Your server logs the email, and the model confirms that it sent it.
- Click **Deny**. The tool does not run. The model gets a denied result and can tell the user.

## How it works

1. The model calls `send_email`.
2. `chat()` sees `needsApproval: true`. It does not run the tool. It ends the run with an interrupt.
3. `useChat` puts the pending call in `interrupts`.
4. The user clicks a button. `resolveInterrupt` sends the answer to the server in a new request.
5. `chat()` runs the tool if the user approved, or records a denied result. Then the model continues.

No database is necessary. The browser sends the full message history back with the answer, so a stateless route can rebuild the paused call.

For the full interrupt lifecycle, batch controls, generic interrupts, and recovery, see [Interrupts](../interrupts/overview) and [Tool Approval](../interrupts/tool-approval). To move from the 0.x approval APIs, see [Migrate to AG-UI interrupts](../interrupts/migration).

## Advanced

### Tool call states

A tool call that needs approval moves through these `ToolCallState` values on the `tool-call` part:

1. `awaiting-input`: the call started, with no arguments yet.
2. `input-streaming`: the arguments arrive.
3. `input-complete`: all arguments are in.
4. `approval-requested`: the call waits for the user.
5. `approval-responded`: the user approved or denied.

When the result comes in, the call part gets `output`, and a sibling `tool-result` part shows `complete` or `error`. See [Tool Architecture](./tool-architecture#call-states).

### Approve with a note, or deny with a reason

An `approvalSchema` gives each answer its own typed data:

```ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const transferDefinition = toolDefinition({
  name: 'transfer',
  description: 'Transfer funds',
  needsApproval: true,
  inputSchema: z.object({
    amount: z.number().positive(),
    recipient: z.string(),
  }),
  approvalSchema: {
    approve: z.object({ note: z.string() }),
    reject: z.object({ reason: z.string() }),
  },
})
```

Put that data under `payload`. When the user approves, you can also replace the arguments in full with `editedArgs`. A rejection never takes edits:

```ts ignore
approval.resolveInterrupt(true, {
  editedArgs: { amount: 12, recipient: 'Ada' },
  payload: { note: 'Reviewed' },
})

approval.resolveInterrupt(false, {
  payload: { reason: 'Policy limit' },
})
```

`approvalSchema` needs `needsApproval: true`. Without it, `toolDefinition()` throws. If edited arguments do not fit `inputSchema`, the resume stops with an `invalid-edited-args` error.

### Deny or cancel

Deny and cancel are different:

- `resolveInterrupt(false, ...)` records a rejection. The rejection can carry the `reject` payload.
- `cancel()` takes no payload and does not use the `reject` schema.

```ts ignore
approval.cancel()
```

### Several approvals at once

- One pending approval submits as soon as it has a valid answer.
- Several pending approvals wait until all of them have valid answers. Then they submit together.
- To answer several in one step, call `resolveInterrupts(...)` on the hook.

See [Multiple Interrupts](../interrupts/multiple).

### Approval on a client tool

A client tool can also need approval. The approval interrupt is the same, so your UI does not change. After the user approves, the browser runs the `.client()` function:

```typescript
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

const deleteLocalDataDef = toolDefinition({
  name: 'delete_local_data',
  description: 'Delete data from local storage',
  inputSchema: z.object({
    key: z.string(),
  }),
  outputSchema: z.object({
    deleted: z.boolean(),
  }),
  needsApproval: true,
})

// Runs only after the user approves
const deleteLocalData = deleteLocalDataDef.client((input) => {
  localStorage.removeItem(input.key)
  return { deleted: true }
})

const { messages, interrupts } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
  tools: [deleteLocalData],
})
```

### Tell a denial from a failure

A denied or cancelled tool result has `state: 'error'` and the wire state `output-error`. To tell it apart from a real tool failure, read `outcome` on the `tool-result` part:

- `'denied'`: the user or a middleware policy denied the call.
- `'cancelled'`: the call was cancelled.
- No `outcome`: a normal tool failure.

```tsx ignore
const denied = message.parts.some(
  (part) => part.type === 'tool-result' && part.outcome === 'denied',
)
```

Use `outcome`, not the error text. When a result is saved as a `ModelMessage`, the outcome goes in `metadata.tanstack.toolResultOutcome`, and it comes back on the UI part. The AG-UI interrupt resume path also sends the outcome and keeps the error content.

### Tips for approval prompts

- **Use approval for actions that you cannot undo.** Emails, payments, and deletes are good examples.
- **Show what will happen.** Show the arguments in a form that a person can read, not raw JSON.
- **Handle a denial.** Read `outcome` and show the user that nothing happened.
- **Think about time limits.** A user can leave an approval open for a long time.
