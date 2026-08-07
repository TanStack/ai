---
title: Migration
id: interrupts-migration
order: 6
description: "Move from legacy approval events and raw resume APIs to typed AG-UI interrupts."
keywords:
  - tanstack ai migration
  - ag-ui interrupts
  - addToolApprovalResponse
  - pendingInterrupts
  - resumeInterrupts
---

# Migration

If you still use `approval-requested` / `addToolApprovalResponse` → switch server lifecycle and client rendering together. No codemod. Start from [Overview](./overview).

Native runs end with `RUN_FINISHED.outcome.type === 'interrupt'`. Continuation is a new run with `parentRunId` = interrupted run.

## API mapping

| Deprecated / legacy | Current |
| --- | --- |
| `pendingInterrupts` | `interrupts` (`pendingInterrupts` is a deprecated alias) |
| `ChatClient.getPendingInterrupts()` | `ChatClient.getInterrupts()` |
| `addToolApprovalResponse({ id, approved })` | Bound `tool-approval` item → `interrupt.resolveInterrupt(approved)` |
| Raw `resumeInterrupts(entries, state)` | Bound item methods or `resolveInterrupts(...)`; `resumeInterruptsUnsafe` only for validated recovery tooling |
| `approval-requested` custom event | `RUN_FINISHED` interrupt, reason `tool_call` |
| `tool-input-available` custom event | `RUN_FINISHED` interrupt, reason `tanstack:client_tool_execution` |
| Boolean denial as cancellation | `resolveInterrupt(false)` = denial; `cancel()` = payloadless cancel |

`addToolResult` remains for client-tool results. `needsApproval` remains the tool-definition switch.

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

Valid singleton submits automatically. Full UI: [Tool Approval](./tool-approval).

## Branch payloads and edits

Legacy booleans could not carry data. Add `approvalSchema` and resolve with `payload`:

```ts ignore
interrupt.resolveInterrupt(true, {
  editedArgs: { amount: 12, recipient: 'Ada' }, // optional, approval-only, full replacement
  payload: { note: 'Reviewed' },
})
interrupt.resolveInterrupt(false, { payload: { reason: 'Policy limit' } })
```

Rejection never accepts edits. One `approvalSchema` (not `{ approve, reject }`) applies to the selected decision; without schema, boolean shorthand stays valid.

## Denial vs cancellation

| Call | Effect |
| --- | --- |
| `resolveInterrupt(false, ...)` | Continues model with explicit rejected decision |
| `cancel()` | AG-UI `status: 'cancelled'`; no validate / reject branch |

Deprecated `addToolApprovalResponse({ approved: false })` maps to **denial**, not cancel.

## Batches

Native batches are all-or-nothing. Replace approval-ID loops with staged items (last valid auto-submits) or one root callback:

```ts ignore
resolveInterrupts((interrupt) => {
  if (interrupt.kind === 'tool-approval') {
    interrupt.resolveInterrupt(true, { payload: { note: 'Batch review' } })
    return
  }
  interrupt.cancel()
})
```

- `resolveInterrupts(true|false)` — all-approval batches, no payload/edits only
- `cancelInterrupts()` — payloadless all-items cancel
- `clearResolution()` — drop one draft
- `retryInterrupts()` — only when every item is staged and root error is retryable

See [Multiple Interrupts](./multiple).

## Generic responses

Do not derive a static type from wire `responseSchema`. Parse as `unknown`, convert with `z.fromJSONSchema`, resolve the validated value. Form: [Generic Interrupts](./generic).

## Server events

Emit in order: `MESSAGES_SNAPSHOT` → optional `STATE_SNAPSHOT` → `RUN_FINISHED` with nonempty interrupt outcome.

Continuations: fresh `runId`, same `threadId`, interrupted run as `parentRunId`, every pending ID exactly once.

Interrupts are **ephemeral**: server rebuilds the expected batch from submitted history + current tool definitions. Stateless routes need no persistence. No authoritative recovery, exactly-once, replay protection, or restart recovery.

`resumeInterruptsUnsafe` is a low-level escape hatch for validated raw entries — not normal approval UI.

## Legacy limits

Deprecated readers map well-formed historical `approval-requested` / `tool-input-available` into one cloned-history follow-up. They do **not** support edited args, custom approval payloads, generic responses, payloadless cancel, or expiry/schema-hash reconciliation (`legacy-unsupported`). Native and legacy items cannot mix in one batch. Failed legacy transport keeps staged decisions and reports `legacy-submit-failed`.

## Checklist

1. Replace custom-event writers with the interrupt terminal.
2. Render bound `interrupts` instead of `pendingInterrupts`.
3. Replace boolean helpers with `resolveInterrupt` + explicit denial/cancel.
4. Replace approval loops with atomic batch staging or `resolveInterrupts`.
5. Keep `addToolResult` for client-tool results; test expiry and failed transport before dropping legacy support.
