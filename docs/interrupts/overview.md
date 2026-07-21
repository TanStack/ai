---
title: Overview
id: interrupts-overview
order: 1
description: "Pause an agent run for a human or application decision, then continue it exactly where it stopped."
keywords:
  - tanstack ai
  - ag-ui interrupts
  - human in the loop
  - tool approval
  - resolveInterrupt
---

# Interrupts

Most agent runs are fire and forget. The model calls tools, they run, you get an
answer back. But some steps shouldn't happen on their own: moving money,
deleting a project, sending an email. And sometimes the agent needs an answer
only the user can give before it can go on.

An interrupt is a pause. The run stops, hands you a decision to make, and then
picks up exactly where it left off once you answer.

## How it works

1. The server reaches a step that needs a decision and ends the run with an
   `interrupt` outcome instead of a final answer.
2. The client gives you the pending decisions as `interrupts`.
3. You resolve each one (approve, reject, submit a value, or cancel).
4. The client starts a fresh continuation run that carries your answers and
   continues the agent.

No database is required. The browser sends the full message history back on the
continuation request, so a stateless server can rebuild the paused step and keep
going.

## What pauses a run

Two kinds of interrupt show up in the `interrupts` array for you to resolve:

| `kind` | You get a pause when | Guide |
| --- | --- | --- |
| `tool-approval` | A tool is marked `needsApproval` and the model calls it | [Tool Approval](./tool-approval) |
| `generic` | Your app ends a run to ask the user something that isn't a tool | [Generic Interrupts](./generic) |

## What about client tools?

A tool with a `.client()` implementation runs in the browser on its own and
reports its own result. That is not a decision you make, so it never appears in
`interrupts`. See [Client Tools](../tools/client-tools).

The one time a tool pauses is when you mark it `needsApproval: true`. Then it
stops for a yes or no first, whether it runs on the server or in the browser:

| Tool | What you handle |
| --- | --- |
| Server tool | Nothing, unless `needsApproval` adds a `tool-approval` pause. It then runs on the server after you approve. |
| Client tool | Nothing, it runs in the browser automatically. With `needsApproval` it pauses for approval first, then runs in the browser. |

So approval is the only thing you resolve for either kind of tool, and both use
the same `tool-approval` interrupt.

## Where to go next

| You want to | Page |
| --- | --- |
| Approve or reject a single tool call | [Tool Approval](./tool-approval) |
| Resolve several pending decisions at once | [Multiple Interrupts](./multiple) |
| Ask the user something that isn't a tool | [Generic Interrupts](./generic) |
| Run a tool in the browser | [Client Tools](../tools/client-tools) |
| Move off the old `approval-requested` events | [Migration](./migration) |
