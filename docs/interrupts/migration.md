---
title: Migration
id: interrupts-migration
order: 6
description: "Move approval and resume code from the 0.x custom events and raw resume APIs to typed AG-UI interrupts in 1.0."
keywords:
  - tanstack ai migration
  - ag-ui interrupts
  - addToolApprovalResponse
  - pendingInterrupts
  - resumeInterrupts
---

Your 0.x app approves tools with `addToolApprovalResponse` and reads
`pendingInterrupts`. 1.0 removed both. In 1.0, approvals, generic pauses, and
client-tool execution are all AG-UI interrupts, and you resolve each one on the
item itself.

There is no codemod. Upgrade the server and the client together. For the full
list of 1.0 changes, see [Upgrade to 1.0](../migration/v1).

## Quick migration

1. Rename `pendingInterrupts` to `interrupts`.
2. Replace each `addToolApprovalResponse` call with
   `interrupt.resolveInterrupt(approved)` on the matching item.
3. Replace approval loops with `resolveInterrupts(...)`.
4. On the server, forward `parentRunId` and `resume` into `chat()`.
5. Finish or drop the runs that paused on 0.x. 1.0 cannot resume them.

The sections below show each step.

## API mapping

| 0.x (removed in 1.0) | 1.0 |
| --- | --- |
| `pendingInterrupts` | `interrupts` |
| `ChatClient.getPendingInterrupts()` | `ChatClient.getInterrupts()` |
| `addToolApprovalResponse({ id, approved })` | Find the bound `tool-approval` item and call `interrupt.resolveInterrupt(approved)`. Removed from every framework and from `ChatClient`. |
| Raw `resumeInterrupts(entries, state)` | Item methods, or root `resolveInterrupts(...)`. Keep `resumeInterruptsUnsafe` for validated recovery tools. |
| `interrupt.error` | `interrupt.errors[0]` |
| `approval-requested` custom event | `RUN_FINISHED` interrupt descriptor, reason `tool_call` |
| `tool-input-available` custom event | `RUN_FINISHED` interrupt descriptor, reason `tanstack:client_tool_execution` |
| Boolean denial treated as cancellation | `resolveInterrupt(false)` for a denial. `cancel()` for a cancellation with no payload. |

These stay the same:

- `addToolResult` still sends client-tool results. It hands them to the
  matching native item.
- `needsApproval` still turns on approval in the tool definition.

## Single approval

```ts ignore
// 0.x
await addToolApprovalResponse({ id: approval.id, approved: true })

// 1.0
const interrupt = interrupts.find(
  (item) => item.kind === 'tool-approval' && item.toolName === 'transfer',
)
if (interrupt?.kind === 'tool-approval' && interrupt.toolName === 'transfer') {
  interrupt.resolveInterrupt(true)
}
```

A single valid item submits at once. For the full component, see
[Tool Approval](./tool-approval).

## Payloads and edits

In 0.x, a boolean approval had no typed data. In 1.0, add an
`approvalSchema` to the tool, and send data under `payload`:

```ts ignore
interrupt.resolveInterrupt(true, {
  editedArgs: { amount: 12, recipient: 'Ada' }, // optional, approval only, full replacement
  payload: { note: 'Reviewed' },
})
interrupt.resolveInterrupt(false, { payload: { reason: 'Policy limit' } })
```

- Rejection never accepts edits.
- Custom fields at the top level are not valid.
- A single `approvalSchema` (not an `{ approve, reject }` map) applies to the
  selected decision.
- With no schema, `resolveInterrupt(true)` and `resolveInterrupt(false)` stay
  valid.

## Denial and cancellation

- `resolveInterrupt(false, ...)` continues the model with an explicit rejected
  decision.
- `cancel()` emits AG-UI `status: 'cancelled'`. It never validates or selects
  the reject branch.

If you called `addToolApprovalResponse({ approved: false })`, use
`resolveInterrupt(false)`. It is a denial, not a cancellation.

## Batches

Native batches are all or nothing. Replace loops over approval ids with one of
these:

- Stage each item. The last valid item submits the batch.
- Answer every item from one synchronous root callback:

```ts ignore
resolveInterrupts((interrupt) => {
  if (interrupt.kind === 'tool-approval') {
    interrupt.resolveInterrupt(true, { payload: { note: 'Batch review' } })
    return
  }
  interrupt.cancel()
})
```

Other root helpers:

- `resolveInterrupts(true)` or `resolveInterrupts(false)`: only for batches of
  approvals with no payload and no edits.
- `cancelInterrupts()`: cancel every item, with no payload.
- `clearResolution()`: drop the draft of one item.
- `retryInterrupts()`: only when every item is still validly staged and the
  root error is retryable.

See [Multiple Interrupts](./multiple).

## Generic responses

Do not derive a static type from a `responseSchema` that you received. Parse
the value as `unknown`, convert the schema with `z.fromJSONSchema`, and then
resolve with the validated value. For typed generic interrupts, use
`defineInterrupt`. See [Generic Interrupts](./generic).

## Server events

A native server emits these events, in this order:

1. `MESSAGES_SNAPSHOT`
2. `STATE_SNAPSHOT` (optional)
3. `RUN_FINISHED` with a nonempty interrupt outcome

A continuation has:

- a new `runId`
- the same `threadId`
- the interrupted run as `parentRunId`
- every pending id, exactly once

Interrupts are **ephemeral**. The server rebuilds and validates the expected
batch from the submitted history and its current tool definitions. So a
stateless route needs no persistence. But the batch comes from client input, so
this mode does not give authoritative recovery, exactly-once delivery, replay
protection, or restart recovery.

`resumeInterruptsUnsafe` is a low-level escape hatch. It sends validated raw
resume entries directly. Do not use it for approval UI.

## Old streams

1.0 does not read the `approval-requested` and `tool-input-available` custom
events. An interrupt descriptor without a binding (only `metadata.kind`) shows
as `kind: 'unbound'`, and you cannot resume it. Upgrade the server and the
client together, and finish or drop the runs that paused on 0.x.

## Before you ship

The quick migration covers the client. Also do these:

1. If your server wrote the 0.x custom events itself, replace those writers
   with the interrupt terminal.
2. Test expired items and a failed transport.

When this is done, your approvals run on 1.0 interrupts. Start from the
[Overview](./overview) for the current flow.
