---
title: Interrupts
id: interrupts
order: 6
description: "Handle AG-UI interrupts with typed tool approvals, generic runtime validation, atomic batches, persistence, and recovery."
keywords:
  - tanstack ai
  - ag-ui interrupts
  - tool approval
  - human in the loop
  - interrupt recovery
  - resolveInterrupt
---

# Interrupts

Interrupts pause a run so an application or person can provide a decision before
the agent continues. TanStack AI binds each AG-UI interrupt descriptor to
methods that validate, stage, and atomically submit its resolution.

Native interrupts use the AG-UI lifecycle:

1. The server snapshots messages and optional state.
2. It persists the complete interrupt batch.
3. It emits `RUN_FINISHED` with `outcome.type === 'interrupt'` and one or more
   descriptors.
4. The client exposes bound items through `interrupts`.
5. The application resolves or cancels every item.
6. The client starts a new continuation run with `parentRunId` set to the
   interrupted run and sends the complete AG-UI `resume` array.

This is a breaking transition from native `approval-requested` and
`tool-input-available` custom events. Native servers no longer emit those
events. Deprecated readers remain for old streams during migration; see
[Migrate to AG-UI interrupts](../migration/interrupts).

## Define a typed approval

`needsApproval: true` requests an approval interrupt. An optional
`approvalSchema` adds application data to the decision. A single schema applies
to either decision; a branch map gives approval and rejection different
payloads.

The shared definition below keeps server execution and client form types
aligned:

```ts
// tools/transfer.ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const transferTool = toolDefinition({
  name: 'transfer',
  description: 'Transfer funds to a recipient',
  needsApproval: true,
  inputSchema: z.object({
    amount: z.number().positive(),
    recipient: z.string().min(1),
  }),
  outputSchema: z.object({
    receiptId: z.string(),
  }),
  approvalSchema: {
    approve: z.object({
      note: z.string().min(1),
    }),
    reject: z.object({
      reason: z.string().min(1),
    }),
  },
})
```

The server executes the tool only after the approval batch is accepted. Native
interrupts require persistence with an atomic interrupt gateway:

```ts
// app/api/chat/route.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'
import { transferTool } from '../../../tools/transfer'

const persistence = sqlitePersistence({
  url: 'file:.tanstack-ai/chat.sqlite',
  migrate: true,
})

const transfer = transferTool.server(
  async (input: { amount: number; recipient: string }) => {
    const { amount, recipient } = input
  return {
    receiptId: `${recipient}-${amount}-${crypto.randomUUID()}`,
  }
  },
)

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    parentRunId: params.parentRunId,
    ...(params.resume ? { resume: params.resume } : {}),
    tools: [transfer],
    middleware: [withChatPersistence(persistence)],
  })

  return toServerSentEventsResponse(stream)
}
```

`migrate: true` is for local SQLite development. Generate, review, and deploy
your backend's native migration before production code uses interrupt batches.
See [Persistence migrations](../persistence/migrations).

Without a persistence capability, the server emits exactly one structured
`RUN_ERROR` with `persistence-required`; it does not expose an interrupt that
cannot be resumed safely.

## Render and resolve bound interrupts

Pass the shared definition to the client so tool names, original arguments,
edited arguments, and branch payloads are inferred. The bound union is
discriminated by `kind`:

- `tool-approval` is a typed approve/reject decision;
- `client-tool-execution` expects the registered tool's output;
- `generic` keeps its application response `unknown`.

```tsx
// app/transfer-chat.tsx
import type { ItemInterruptError } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { transferTool } from '../tools/transfer'

export function TransferChat() {
  const {
    interrupts,
    resolveInterrupts,
    cancelInterrupts,
    retryInterrupts,
    interruptErrors,
    resuming,
  } = useChat({
    threadId: 'account-42',
    connection: fetchServerSentEvents('/api/chat'),
    tools: [transferTool] as const,
  })

  const transfer = interrupts.find(
    (item) => item.kind === 'tool-approval' && item.toolName === 'transfer',
  )

  return (
    <section>
      {transfer?.kind === 'tool-approval' &&
      transfer.toolName === 'transfer' ? (
        <article>
          <p>
            Transfer {transfer.originalArgs.amount} to{' '}
            {transfer.originalArgs.recipient}?
          </p>
          <button
            disabled={!transfer.canResolve || resuming}
            onClick={() =>
              transfer.resolveInterrupt(true, {
                editedArgs: { amount: 12, recipient: 'Ada' },
                payload: { note: 'Reviewed' },
              })
            }
          >
            Approve edited transfer
          </button>
          <button
            disabled={!transfer.canResolve || resuming}
            onClick={() =>
              transfer.resolveInterrupt(false, {
                payload: { reason: 'Policy limit' },
              })
            }
          >
            Reject
          </button>
          <button onClick={() => transfer.cancel()}>Cancel</button>
          <button onClick={() => transfer.clearResolution()}>
            Clear decision
          </button>
          {transfer.errors.map((error: ItemInterruptError) => (
            <p key={`${error.code}:${error.path?.join('.') ?? ''}`}>
              {error.message}
            </p>
          ))}
        </article>
      ) : null}

      {interruptErrors.map((error) => (
        <p key={`${error.code}:${error.generation}`}>{error.message}</p>
      ))}

      <button onClick={() => void resolveInterrupts(true)}>
        Approve eligible batch
      </button>
      <button onClick={() => void cancelInterrupts()}>Cancel batch</button>
      <button onClick={() => void retryInterrupts()}>Retry batch</button>
    </section>
  )
}
```

For approval, `true` without `editedArgs` executes the original input. When
provided, `editedArgs` is a validated **full replacement**, not a partial merge.
Only approval can edit arguments. Rejection options never accept `editedArgs`.

Branch data always belongs under `payload`:

```ts ignore
interrupt.resolveInterrupt(true, {
  editedArgs: { amount: 12, recipient: 'Ada' },
  payload: { note: 'Reviewed' },
})

interrupt.resolveInterrupt(false, {
  payload: { reason: 'Policy limit' },
})
```

The selected `approve` or `reject` schema validates only its nested `payload`.
The server validates the complete envelope again before executing anything.

### Rejection is not cancellation

`resolveInterrupt(false, ...)` is a resolved denial. The continuation receives
the denial and its optional rejection payload, so the model can respond to the
decision. `cancelInterrupt()` produces AG-UI `status: 'cancelled'`, carries no
payload, and does not select the reject branch.

Use denial when the user has answered "no." Use cancellation when the workflow
is being abandoned without an answer.

## Singleton and batch submission

Item methods return `void` because they stage local state. A valid resolution
for a singleton batch submits automatically. In a multi-item native batch,
each `resolveInterrupt` stages its item and the last valid item automatically
submits the entire batch. The server accepts all resolutions atomically or none
of them.

For one synchronous transaction, use root `resolveInterrupts` and resolve every
item inside its callback:

```ts ignore
await resolveInterrupts((interrupt) => {
  if (
    interrupt.kind === 'tool-approval' &&
    interrupt.toolName === 'transfer'
  ) {
    interrupt.resolveInterrupt(true, {
      editedArgs: interrupt.originalArgs,
      payload: { note: 'Approved in batch review' },
    })
    return
  }

  interrupt.cancel()
})
```

The callback must synchronously produce a valid resolution or cancellation for
every item. It cannot be async. If it throws or leaves an item unresolved, no
partial submission occurs.

The boolean shorthand `resolveInterrupts(true)` or
`resolveInterrupts(false)` is only valid when every item is a tool approval and
the selected branches require no payload or edits. It is rejected for generic
interrupts, client-tool outputs, mixed batches, or required branch payloads.
`cancelInterrupts()` is the payloadless all-items operation.

`clearResolution()` removes an item's staged draft and validation errors.
`retryInterrupts()` retries the current complete batch after a retryable root
transport or server error; it does not invent missing item responses.

## Validate a generic AG-UI response schema

A generic AG-UI descriptor may carry a Draft 2020-12 `responseSchema`. Because
the schema arrives over the wire, its application payload remains `unknown`
statically. Convert the received schema to a runtime validator before calling
the bound resolver.

This example uses the real Zod 4 JSON Schema converter and never asserts a
wire-derived static type:

```ts
import { z } from 'zod'
import type { GenericAGUIInterrupt } from '@tanstack/ai-client'

export function resolveGenericEditorValue(
  interrupt: GenericAGUIInterrupt,
  editorValue: string,
): readonly string[] {
  if (!interrupt.responseSchema) {
    return ['This interrupt has no response schema.']
  }

  let candidateResponse: unknown
  try {
    candidateResponse = JSON.parse(editorValue)
  } catch {
    return ['Enter valid JSON.']
  }

  const responseValidator = z.fromJSONSchema(interrupt.responseSchema)
  const parsed = responseValidator.safeParse(candidateResponse)
  if (!parsed.success) {
    return parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    )
  }

  interrupt.resolveInterrupt(parsed.data)
  return []
}
```

The conversion produces a runtime schema, not a trustworthy static application
type. TanStack AI still performs canonical Draft 2020-12 validation in the
client, and server validation remains authoritative. An invalid or unsupported
wire schema surfaces an item or root `invalid-response-schema` error rather
than bypassing validation.

Applications that emit generic descriptors must persist the complete batch
before exposing the interrupt terminal and must send JSON-compatible Draft
2020-12 schemas. Tool approvals usually prefer shared `approvalSchema` because
it adds compile-time branch inference as well as runtime validation.

## Client-tool execution is a separate interrupt

Approval and execution are independent axes. A client tool with
`needsApproval: true` first produces a `tool-approval` decision. If approved,
the server can later produce a `client-tool-execution` item for the browser
result.

```ts ignore
const execution = interrupts.find(
  (item) =>
    item.kind === 'client-tool-execution' && item.toolName === 'showReceipt',
)

if (
  execution?.kind === 'client-tool-execution' &&
  execution.toolName === 'showReceipt'
) {
  execution.resolveInterrupt({ displayed: true })
}
```

The output is validated against the tool's output schema. The existing
`addToolResult` API remains supported: for a matching native item it delegates
to the same staged client-tool resolution, while legacy streams retain their
historical result path.

## Errors and retry

Each item exposes `errors` for payload, edited-argument, output, expiry, and
binding failures. Root `interruptErrors` reports batch, transport, persistence,
stale-generation, conflict, and recovery failures. `canResolve` is false when
an item is expired, submitting, or quarantined for recovery.

A failed candidate does not erase the last valid staged response. Correct the
form and call `resolveInterrupt` again, call `clearResolution()` to start over,
or call `retryInterrupts()` after a retryable submission failure. Non-retryable
stale and conflict errors require authoritative recovery.

## Persistence, drafts, recovery, and tab conflicts

Server state and browser drafts have different authority:

- `withChatPersistence` atomically opens the descriptor/binding batch and
  commits the exact resolution set with compare-and-swap semantics.
- Browser `ChatResumeSnapshotV2` stores raw JSON-safe drafts only. It never
  stores bound methods, validators, tool implementations, or hydrated errors.
- On reload, authoritative recovery runs before descriptors are rebound and
  before a draft can be restored.
- Submission fingerprints make an exact retry idempotent. The same accepted
  batch replays or joins the winning continuation instead of executing tools
  again.
- A second tab with a stale generation loses the compare-and-swap. It replaces
  local state from recovery or joins the already-committed continuation; it
  never starts a second tool execution.

Recovery routes are opt-in and explicit. TanStack AI never infers a recovery
or continuation URL from the chat URL. Configure the connection with the
application-owned endpoints:

```ts
import {
  createInterruptContinuationLoader,
  createInterruptStateFetcher,
  fetchServerSentEvents,
} from '@tanstack/ai-client'

const connection = fetchServerSentEvents('/api/chat', {
  interruptStateFetcher: createInterruptStateFetcher(
    '/api/interrupts/recovery',
  ),
  continuationLoader: createInterruptContinuationLoader(
    '/api/interrupts/continuation',
  ),
})
```

The recovery endpoint must authenticate the caller, authorize the requested
thread, and return the application store's authoritative recovery DTO. The
continuation endpoint is a read-only GET of the winning run. See
[Chat persistence](../persistence/chat-persistence),
[Custom stores](../persistence/custom-stores), and
[Delivery durability](../persistence/delivery-durability).

`resumeInterruptsUnsafe` remains a distinct low-level escape hatch for already
validated raw AG-UI resume entries and explicit recovery tooling. It is not the
replacement for normal approval UI; prefer bound item methods and root batch
controls.

## Next steps

- [Tool approval flow](../tools/tool-approval) focuses on approval forms.
- [Client tools](../tools/client-tools) explains browser execution.
- [Migrate to AG-UI interrupts](../migration/interrupts) maps deprecated APIs.
- [Approval flow architecture](../architecture/approval-flow-processing)
  details validate-all, CAS, continuation, and replay processing.
