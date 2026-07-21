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
resolveInterrupts((interrupt) => {
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

## Server events

A native server emits, in order: `MESSAGES_SNAPSHOT` → optional
`STATE_SNAPSHOT` → `RUN_FINISHED` with a nonempty interrupt outcome.
Continuations use a fresh `runId`, the same `threadId`, and the interrupted run
as `parentRunId`, with every pending ID present exactly once.

Interrupts run **ephemerally**: the server reconstructs and validates the
expected batch from the submitted history and its current tool definitions, so
a stateless route needs no persistence. Because the batch is rebuilt from
client-provided input, this mode has no authoritative recovery, exactly-once,
replay protection, restart recovery, or compare-and-swap — those are the concern
of a separate, optional durable-persistence layer that is not part of this
package.

`resumeInterruptsUnsafe` is a low-level escape hatch for submitting validated
raw resume entries directly — not the normal target for approval UI.

## Legacy limits

Deprecated readers recognize well-formed historical `approval-requested` and
`tool-input-available` events and convert a fully-covered legacy batch into one
cloned-history follow-up. They do **not** support edited arguments, custom
approval payloads, generic responses, payloadless cancellation, or expiry/
schema-hash reconciliation — those fail with `legacy-unsupported`. Native and
legacy items can't mix in one batch; a failed legacy transport keeps staged
decisions and reports `legacy-submit-failed`.

## Checklist

1. Replace native custom-event writers with the interrupt terminal.
2. Render bound `interrupts` instead of `pendingInterrupts`.
3. Replace boolean approval helpers with `resolveInterrupt` + explicit
   denial/cancellation.
4. Replace approval loops with atomic batch staging or root `resolveInterrupts`.
5. Keep `addToolResult` for client-tool results where useful.
6. Test expired items and failed transport before removing legacy support.
