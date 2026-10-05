---
'@tanstack/ai-harness': minor
---

`createSessionView` from `@tanstack/ai-harness/view` now handles client tools and sign-ins that a turn waits for.

- A client tool (a harness tool with no server implementation) is in the new `state.clientTools` list, not in `approvals`. Each item has `id`, `toolCallId`, `tool`, `args`, `resolve(output)` and `fail(message)`. A `clientTool` event fires for each new item.
- The view sends one resume when every open approval and client tool has an answer.
- A turn that waits for a sign-in (`credentials.require(id, { wait: true })`) shows in `state.signIns`, not in `approvals`, also after a reload.
