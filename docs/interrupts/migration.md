---
title: Migration
id: interrupts-migration
order: 6
description: "Migrate approval and resume code from legacy custom events and raw resume APIs to typed, atomic AG-UI interrupts."
keywords:
  - tanstack ai migration
  - ag-ui interrupts
  - addToolApprovalResponse
  - pendingInterrupts
  - resumeInterrupts
---

# Migration

TanStack AI now models approvals, generic pauses, and client-tool execution as
AG-UI interrupt descriptors. Native runs end with
`RUN_FINISHED.outcome.type === 'interrupt'`, and the continuation is a new run
whose `parentRunId` is the interrupted run.

There's no codemod — migrate the server lifecycle, client rendering, and (if
used) persistence schema together. Legacy readers stay temporarily for old
streams but can't provide the full native contract. Start from
[Overview](./overview).

## API mapping

| Deprecated / legacy | Current |
| --- | --- |
| `pendingInterrupts` | `interrupts` (`pendingInterrupts` is a deprecated alias of the same array) |
| `ChatClient.getPendingInterrupts()` | `ChatClient.getInterrupts()` |
| `addToolApprovalResponse({ id, approved })` | Find the bound `tool-approval` item, call `interrupt.resolveInterrupt(approved)` |
| Raw `resumeInterrupts(entries, state)` | Bound item methods or root `resolveInterrupts(...)`; reserve `resumeInterruptsUnsafe` for validated recovery tooling |
| `approval-requested` custom event | `RUN_FINISHED` interrupt descriptor, reason `tool_call` |
| `tool-input-available` custom event | `RUN_FINISHED` interrupt descriptor, reason `tanstack:client_tool_execution` |
| Boolean denial treated as cancellation | `resolveInterrupt(false)` for denial; `cancel()` for payloadless cancellation |

`addToolResult` is **not** removed — it still handles client-tool results and
delegates to a matching native item. `needsApproval` remains the tool-definition
switch for approvals.

## Single approval

```ts ignore
// Before
await addToolApprovalResponse({ id: approval.id, approved: true })

// After
const interrupt = interrupts.find(
  (item) => item.kind === 'tool-approval' && item.toolName === 'transfer',
)
if (interrupt?.kind === 'tool-approval' && interrupt.toolName === 'transfer') {
  interrupt.resolveInterrupt(true)
}
```

A valid singleton submits automatically. For the full render/resolve component
see [Tool Approval](./tool-approval).

## Branch payloads and edits

Legacy boolean approvals couldn't carry typed data. Add `approvalSchema` and
resolve the selected branch with data under `payload`:

```ts ignore
interrupt.resolveInterrupt(true, {
  editedArgs: { amount: 12, recipient: 'Ada' }, // optional, approval-only, full replacement
  payload: { note: 'Reviewed' },
})
interrupt.resolveInterrupt(false, { payload: { reason: 'Policy limit' } })
```

Rejection never accepts edits; top-level custom fields are invalid. A single
`approvalSchema` (not `{ approve, reject }`) applies to the selected decision;
with no schema the boolean shorthand stays valid.

## Denial vs cancellation

`resolveInterrupt(false, ...)` continues the model with an explicit rejected
decision. `cancel()` emits AG-UI `status: 'cancelled'` and never validates or
selects the reject branch. Deprecated `addToolApprovalResponse({ approved: false })`
maps to denial, not cancellation.

## Batches

Native batches are all-or-nothing — replace approval-ID loops with staged items
(the last valid item auto-submits) or one synchronous root callback:

```ts ignore
await resolveInterrupts((interrupt) => {
  if (interrupt.kind === 'tool-approval') {
    interrupt.resolveInterrupt(true, { payload: { note: 'Batch review' } })
    return
  }
  interrupt.cancel()
})
```

`resolveInterrupts(true|false)` is shorthand only for all-approval batches with
no payload/edits. Use `cancelInterrupts()` for payloadless all-items cancel,
`clearResolution()` to drop one draft, `retryInterrupts()` only when every item
is still validly staged and the root error is retryable. See
[Multiple Interrupts](./multiple).

## Generic responses

Don't derive a static type from a received `responseSchema` — parse as
`unknown`, convert with `z.fromJSONSchema`, then resolve the validated value.
Full form example in [Generic Interrupts](./generic).

## Server events and persistence

A native server emits, in order: `MESSAGES_SNAPSHOT` → optional
`STATE_SNAPSHOT` → `RUN_FINISHED` with a nonempty interrupt outcome.
Continuations use a fresh `runId`, the same `threadId`, and the interrupted run
as `parentRunId`, with every pending ID present exactly once.

Persistence is optional. Without it, the batch is reconstructed and validated
from the submitted history (client-provided input — no authoritative recovery,
exactly-once, replay protection, restart recovery, or CAS). With it, stored
schema hashes, expiry, and generation are validated before one compare-and-swap
commit, and exact retries attach to the winning continuation. Upgrade your
persistence schema (batch/binding/generation/fingerprint/continuation/tombstone
storage and run correlation) before deploying — see
[Persistence & Recovery](./persistence),
[Persistence migrations](../persistence/migrations), and
[Custom stores](../persistence/custom-stores).

## Explicit recovery

Browser persistence writes a V2 envelope of raw JSON-safe drafts only; after
reload the client fetches authoritative recovery before rebinding descriptors.
Configure application-owned URLs — none is inferred from `/api/chat`:

```ts
import {
  createInterruptContinuationLoader,
  createInterruptStateFetcher,
  fetchServerSentEvents,
} from '@tanstack/ai-client'

const connection = fetchServerSentEvents('/api/chat', {
  interruptStateFetcher: createInterruptStateFetcher('/api/interrupts/recovery'),
  continuationLoader: createInterruptContinuationLoader(
    '/api/interrupts/continuation',
  ),
})
```

`resumeInterruptsUnsafe` is only for low-level recovery integrations with
validated raw resume entries — not the normal target for approval UI.

## Legacy limits

Deprecated readers recognize well-formed historical `approval-requested` and
`tool-input-available` events and convert a fully-covered legacy batch into one
cloned-history follow-up. They do **not** support edited arguments, custom
approval payloads, generic responses, payloadless cancellation, expiry/
schema-hash reconciliation, generation conflicts, or native recovery — those
fail with `legacy-unsupported`. Native and legacy items can't mix in one batch;
a failed legacy transport keeps staged decisions and reports `legacy-submit-failed`.

## Checklist

1. Deploy persistence schema changes for every configured backend.
2. Add `withChatPersistence(...)` to interrupt-producing routes.
3. Replace native custom-event writers with the interrupt terminal.
4. Render bound `interrupts` instead of `pendingInterrupts`.
5. Replace boolean approval helpers with `resolveInterrupt` + explicit
   denial/cancellation.
6. Replace approval loops with atomic batch staging or root `resolveInterrupts`.
7. Add explicit recovery/continuation endpoints before enabling V2 draft restore.
8. Keep `addToolResult` for client-tool results where useful.
9. Test reloads, exact retries, two-tab conflicts, expired items, and failed
   transport recovery before removing legacy support.
