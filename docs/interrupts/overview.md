---
title: Overview
id: interrupts-overview
order: 1
description: "Pause an agent run for a decision, then resume it — tool approvals and generic application pauses over the AG-UI interrupt lifecycle."
keywords:
  - tanstack ai
  - ag-ui interrupts
  - human in the loop
  - tool approval
  - resolveInterrupt
---

# Interrupts

An interrupt pauses a run so an application or a person can supply a decision
before the agent continues. TanStack AI binds each AG-UI interrupt to typed
methods that validate, stage, and atomically submit its resolution.

## Lifecycle

1. The server snapshots messages (and optional state).
2. It emits `RUN_FINISHED` with `outcome.type === 'interrupt'` and one or more descriptors.
3. The client exposes bound items as `interrupts`.
4. Your app resolves or cancels every item.
5. The client starts a continuation run — new `runId`, same `threadId`,
   `parentRunId` set to the interrupted run — carrying the AG-UI `resume` array
   and the current message history.

This works **without persistence**. In the default ephemeral mode the server
reconstructs and validates the expected batch from the submitted history and its
current tool definitions. Durable persistence and authoritative recovery are an
optional layer shipped separately with the persistence guides.

## Kinds you resolve

The bound `interrupts` array holds the pauses your app resolves:

| `kind` | Meaning | Guide |
| --- | --- | --- |
| `tool-approval` | Approve or reject a tool call, optionally editing its args | [Tool Approval](./tool-approval) |
| `generic` | Any application pause with a wire `responseSchema` | [Generic Interrupts](./generic) |

**Client tools are not on this list.** Running a tool in the browser and
returning its result is not something you resolve by hand — a tool with a
`.client()` implementation runs automatically and reports its own result. See
[Client Tools](../tools/client-tools). Approval is a separate axis: add
`needsApproval: true` to any tool (server or client) and it pauses on a
`tool-approval` interrupt first; a client tool then runs automatically once
approved.

| Tool | What you handle |
| --- | --- |
| Server tool | nothing (runs on the server); a `tool-approval` interrupt first if `needsApproval` |
| Client tool (`.client()` impl) | nothing (runs automatically); a `tool-approval` interrupt first if `needsApproval` |

## Where to go next

| You want to… | Page |
| --- | --- |
| Approve/reject a single tool call and render it | [Tool Approval](./tool-approval) |
| Render and resolve several pending interrupts at once | [Multiple Interrupts](./multiple) |
| Validate a schema-driven application pause | [Generic Interrupts](./generic) |
| Run a tool in the browser and return its result | [Client Tools](../tools/client-tools) |
| Move off legacy `approval-requested` events | [Migration](./migration) |

> This replaced the native `approval-requested` and `tool-input-available`
> custom events. Native servers no longer emit them; deprecated readers remain
> for old streams during [migration](./migration).
