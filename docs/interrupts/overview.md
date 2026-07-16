---
title: Overview
id: interrupts-overview
order: 1
description: "Pause an agent run for a decision, then resume it — tool approvals, generic pauses, and client-tool execution over the AG-UI interrupt lifecycle."
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
current tool definitions. Persistence is an optional durability layer — see
[Persistence & Recovery](./persistence).

## Three kinds

The bound `interrupts` array is a union discriminated by `kind`:

| `kind` | Meaning | Guide |
| --- | --- | --- |
| `tool-approval` | Approve or reject a tool call, optionally editing its args | [Tool Approval](./tool-approval) |
| `client-tool-execution` | Run a tool in the browser and return its output | [Client-Tool Execution](./client-tool-execution) |
| `generic` | Any application pause with a wire `responseSchema` | [Generic Interrupts](./generic) |

These describe the **pause**, not the tool — approval and browser execution are
independent axes. A client tool with `needsApproval: true` trips **both** in
sequence: a `tool-approval` decision first, then a `client-tool-execution`
request once approved.

| Tool | Interrupts it produces |
| --- | --- |
| Server tool, no approval | none — runs on the server |
| Server tool, `needsApproval` | `tool-approval`, then runs on the server |
| Client tool, no approval | `client-tool-execution` |
| Client tool, `needsApproval` | `tool-approval`, then `client-tool-execution` |

## Where to go next

| You want to… | Page |
| --- | --- |
| Approve/reject a single tool call and render it | [Tool Approval](./tool-approval) |
| Render and resolve several pending interrupts at once | [Multiple Interrupts](./multiple) |
| Validate a schema-driven application pause | [Generic Interrupts](./generic) |
| Return a browser-computed tool result | [Client-Tool Execution](./client-tool-execution) |
| Survive reloads, retries, and multi-tab conflicts | [Persistence & Recovery](./persistence) |
| Move off legacy `approval-requested` events | [Migration](./migration) |

> This replaced the native `approval-requested` and `tool-input-available`
> custom events. Native servers no longer emit them; deprecated readers remain
> for old streams during [migration](./migration).
