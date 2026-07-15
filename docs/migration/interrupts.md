---
title: Migrate to AG-UI Interrupts
id: migrate-interrupts
order: 8
description: "Migrate TanStack AI approval and resume code from legacy custom events and raw resume APIs to typed, atomic AG-UI interrupts."
keywords:
  - tanstack ai migration
  - ag-ui interrupts
  - addToolApprovalResponse
  - pendingInterrupts
  - resumeInterrupts
---

# Migrate to AG-UI Interrupts

TanStack AI now represents approvals, generic pauses, and client-tool execution
with standard AG-UI interrupt descriptors and results. Native runs end with
`RUN_FINISHED.outcome.type === 'interrupt'`; the continuation is a new run whose
`parentRunId` is the interrupted run.

There is no codemod. Migrate the server lifecycle, client rendering, and
persistence schema together. The old readers remain temporarily available for
legacy streams, but they cannot provide the full native contract.

For the complete API and runnable server/client setup, read
[Interrupts](../chat/interrupts).

## API mapping

| Deprecated or legacy surface | Current surface |
| --- | --- |
| `pendingInterrupts` | `interrupts` (`pendingInterrupts` is a deprecated alias of the same bound array) |
| `ChatClient.getPendingInterrupts()` | `ChatClient.getInterrupts()` |
| `addToolApprovalResponse({ id, approved })` | Find the bound `tool-approval` item and call `interrupt.resolveInterrupt(approved)` |
| Raw `resumeInterrupts(entries, state)` | Bound item methods or root `resolveInterrupts(...)`; reserve `resumeInterruptsUnsafe` for validated low-level recovery tooling |
| Native `approval-requested` custom event | `RUN_FINISHED` interrupt descriptor with reason `tool_call` |
| Native `tool-input-available` custom event | `RUN_FINISHED` interrupt descriptor with reason `tanstack:client_tool_execution` |
| Boolean denial treated like cancellation | `resolveInterrupt(false)` for denial; `cancel()` for payloadless cancellation |

`addToolResult` is **not** removed. It remains supported for client-tool results
and delegates to a matching native client-tool interrupt when one exists.
`needsApproval` also remains the tool-definition switch for approvals.

## Migrate a single approval

Before:

```ts ignore
await addToolApprovalResponse({
  id: approval.id,
  approved: true,
})
```

After:

```ts ignore
const interrupt = interrupts.find(
  (item) => item.kind === 'tool-approval' && item.toolName === 'transfer',
)

if (
  interrupt?.kind === 'tool-approval' &&
  interrupt.toolName === 'transfer'
) {
  interrupt.resolveInterrupt(true)
}
```

The bound method validates locally and the server validates again. A valid
singleton submits automatically.

## Add branch payloads and optional edits

Legacy boolean approvals could not carry typed branch-specific application
data. Add `approvalSchema` to the shared tool definition:

```ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const transferTool = toolDefinition({
  name: 'transfer',
  description: 'Transfer funds',
  needsApproval: true,
  inputSchema: z.object({
    amount: z.number().positive(),
    recipient: z.string().min(1),
  }),
  approvalSchema: {
    approve: z.object({ note: z.string().min(1) }),
    reject: z.object({ reason: z.string().min(1) }),
  },
})
```

Resolve the selected branch with data nested under `payload`:

```ts ignore
interrupt.resolveInterrupt(true, {
  editedArgs: { amount: 12, recipient: 'Ada' },
  payload: { note: 'Reviewed' },
})

interrupt.resolveInterrupt(false, {
  payload: { reason: 'Policy limit' },
})
```

`editedArgs` is optional and approval-only. It is a full replacement validated
against the original input schema. Omitting it keeps the original tool input.
Rejection never accepts edits. Custom branch fields at the top level are
invalid; keep them grouped under `payload`.

If `approvalSchema` is one schema instead of `{ approve, reject }`, that schema
applies to the selected decision. If no approval schema exists, the normal
boolean shorthand remains valid.

## Separate denial from cancellation

These are intentionally different results:

```ts ignore
// Canonical denial: a resolved answer, optionally with a reject payload.
interrupt.resolveInterrupt(false, {
  payload: { reason: 'Not authorized' },
})

// Cancellation: no decision and no payload.
interrupt.cancel()
```

A denial continues the model with an explicit rejected decision. Cancellation
emits AG-UI `status: 'cancelled'` and never validates or selects the reject
branch. Deprecated `addToolApprovalResponse({ approved: false })` maps to a
denial for compatibility; it does not map to cancellation.

## Migrate a batch

Previously, applications often looped over approval IDs and sent multiple
requests. Native interrupt batches are all-or-nothing. Stage each item; the
last valid item auto-submits the complete batch:

```ts ignore
for (const interrupt of interrupts) {
  if (interrupt.kind === 'tool-approval') {
    interrupt.resolveInterrupt(true)
  } else {
    interrupt.cancel()
  }
}
```

For a single synchronous transaction, use the root callback:

```ts ignore
await resolveInterrupts((interrupt) => {
  if (
    interrupt.kind === 'tool-approval' &&
    interrupt.toolName === 'transfer'
  ) {
    interrupt.resolveInterrupt(true, {
      editedArgs: interrupt.originalArgs,
      payload: { note: 'Approved during batch review' },
    })
    return
  }

  interrupt.cancel()
})
```

The callback must synchronously resolve or cancel every item. It cannot return a
promise. An invalid item, thrown error, or incomplete set prevents the entire
submission.

`resolveInterrupts(true)` and `resolveInterrupts(false)` are convenience
operations only for all-tool-approval batches whose selected branches require
no payload or edits. They are rejected for generic items, client-tool outputs,
mixed batches, and required branch payloads. Use `cancelInterrupts()` for a
payloadless all-items cancellation.

Use `interrupt.clearResolution()` to remove one staged draft and its errors.
Use `retryInterrupts()` only after every item still has a valid staged response
and the root error is retryable.

## Migrate generic responses

Generic AG-UI descriptors carry a wire `responseSchema`, but their application
payload remains `unknown`. Do not derive a static TypeScript type from received
JSON. Parse the editor value as `unknown`, convert the Draft 2020-12 schema to a
runtime validator, then resolve the validated value:

```ts
import { z } from 'zod'
import type { GenericAGUIInterrupt } from '@tanstack/ai-client'

function submitGenericValue(
  interrupt: GenericAGUIInterrupt,
  editorValue: string,
): readonly string[] {
  if (!interrupt.responseSchema) return ['Missing response schema.']

  let value: unknown
  try {
    value = JSON.parse(editorValue)
  } catch {
    return ['Enter valid JSON.']
  }

  const validator = z.fromJSONSchema(interrupt.responseSchema)
  const result = validator.safeParse(value)
  if (!result.success) {
    return result.error.issues.map((issue) => issue.message)
  }

  interrupt.resolveInterrupt(result.data)
  return []
}
```

The client performs canonical validation too, and server validation remains
authoritative.

## Migrate server events; add persistence only when needed

A native server must emit snapshots before the interrupt terminal:

1. `MESSAGES_SNAPSHOT`
2. optional `STATE_SNAPSHOT`
3. `RUN_FINISHED` with a nonempty interrupt outcome

Persistence is optional. Without it, TanStack AI emits the interrupt terminal
and reconstructs the expected batch from the full message history on the
continuation request. It validates the entire resume array against the current
tool definitions before executing anything.

Continuations use a fresh `runId`, the same `threadId`, and the interrupted run
as `parentRunId`. The resume request contains every pending ID exactly once.
In ephemeral mode, server validation covers every payload, edited input, and
tool schema, but the submitted history remains client-provided input. There is
no authoritative reload recovery, exactly-once execution, replay protection,
restart recovery, or cross-instance compare-and-swap.

When persistence is configured, it additionally validates stored schema hashes,
expiry, and generation before one compare-and-swap commit. Exact retries attach
to the winning continuation rather than executing tools again.

If your application uses persistence, upgrade its schema before deploying the
new runtime:

- add the interrupt batch, binding, generation, submission fingerprint,
  continuation, and accepted-tombstone storage required by your adapter;
- add the parent/current run correlation used by compare-and-swap;
- generate and deploy your application's native Prisma migration after copying
  the updated model fragment;
- deploy Drizzle or Cloudflare migration assets through the application's normal
  migration process.

See [Persistence migrations](../persistence/migrations) and
[Custom stores](../persistence/custom-stores).

## Opt in to native recovery explicitly

Browser persistence now writes a V2 envelope containing raw JSON-safe drafts.
Bound methods, validators, tool implementations, kinds, and hydrated errors are
not stored. After reload, the client must fetch authoritative recovery state
before rebinding descriptors or restoring a draft.

Configure application-owned URLs explicitly:

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

No recovery route is inferred from `/api/chat`. Your recovery endpoint must
authenticate the caller and authorize the thread. The continuation endpoint
must read the winning run without scheduling a new model invocation.

`resumeInterruptsUnsafe` is available only for low-level recovery integrations
that already possess validated raw AG-UI resume entries and correlation state.
It is not the normal migration target for approval UI.

## Legacy compatibility limits

Deprecated readers recognize well-formed historical `approval-requested` and
`tool-input-available` events. They do not create a second native writer. A
legacy batch is converted into one cloned-history follow-up only after every
item is covered.

Legacy descriptors do not support:

- edited arguments or custom approval payloads;
- generic AG-UI responses;
- native payloadless cancellation semantics;
- expiry and schema-hash reconciliation;
- generation conflicts or authoritative native recovery.

Those operations fail with `legacy-unsupported`. Native and legacy items cannot
be mixed in one batch. If legacy transport submission fails, staged decisions
remain available and the root reports `legacy-submit-failed`.

## Migration checklist

1. Deploy persistence schema changes for every configured backend.
2. Add `withChatPersistence(...)` to interrupt-producing chat routes.
3. Replace native custom-event writers with the AG-UI interrupt terminal.
4. Replace `pendingInterrupts` rendering with bound `interrupts`.
5. Replace boolean approval helpers with `resolveInterrupt` and explicit
   denial/cancellation behavior.
6. Replace approval loops with atomic batch staging or root
   `resolveInterrupts(...)`.
7. Add explicit recovery and continuation endpoints before enabling V2 draft
   restoration.
8. Keep `addToolResult` for client-tool results where it is still useful.
9. Test reloads, exact retries, two-tab conflicts, expired items, and failed
   transport recovery before removing legacy support.
