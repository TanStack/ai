---
'@tanstack/ai': patch
'@tanstack/ai-persistence': patch
'@tanstack/ai-durable-stream': patch
'@tanstack/ai-sandbox': patch
'@tanstack/ai-client': patch
'@tanstack/ai-harness': patch
'@tanstack/ai-react': patch
'@tanstack/ai-solid': patch
'@tanstack/ai-vue': patch
'@tanstack/ai-preact': patch
'@tanstack/ai-angular': patch
---

Fix durable interrupt lifecycle bugs across server persistence, harness recovery, client hydration, transport reconnect, and framework adapters:

- Commit answered tool approvals before follow-up model calls, guard concurrent duplicate resumes, preserve declined tool outcomes across failures, reset same-`runId` continuations to `'running'`, isolate chat-owned pending interrupts from foreign unbound records, and assign fresh step ids to multi-step `MCPInputRequiredError` prompts.
- Prevent mid-continuation interrupt resurrection, clear stale hydrated interrupts, auto-resume hydrated `client-tool-execution` pauses, restore `ToolCallPart` approval state, keep SSE reconnect alive past intermediate `RUN_FINISHED(tool_calls)` chunks, preserve Run 1 tool calls during `joinRun`, and roll back failed approval submissions.
- Consume `ai-harness` `permissions()` waits after tool execution, recover pending `resolve` inputs on host restart, persist `permissions()` and `question()` answers across multi-pause restarts, terminate replayed `/run` resume streams, recover live durable-stream 404 responses, and keep sandbox `RunRecord.status` as `'interrupted'` without `finishedAt`.
- Preserve pending interrupts across component unmount and thread switch in React, Solid, Vue, Preact, and Angular adapters, and update Solid inline tool interrupt props reactively without remounting tool components.
- `ai-persistence` sends an `interrupts:committed` CUSTOM event when it commits the answers of a resume before the follow-up model call. When that model call fails, `ChatClient` keeps the answers used and does not show the approvals again. With `persistence: true`, a failed resume with no such event loads the thread state from the server.
- Add `ChatClient.getInterruptDescriptors()`, which returns the raw interrupts of the run, client-tool executions included. React `useChat` uses it, so a pending client tool runs again after a hidden `<Activity>` replaces the client.
- `permissions()` and `question()` keep a stored answer only for the call it answers. An answer of a call that never ran is dropped at the next boundary, and a later call that reuses the same tool call id asks again. Each run (the lead turn or one agent run) has its own `permissions()` answers, so the answer of a parallel run never approves a call with the same id.
