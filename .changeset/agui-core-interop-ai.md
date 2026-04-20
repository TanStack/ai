---
'@tanstack/ai': major
---

**AG-UI core interop — spec-compliant event types.** `StreamChunk` now re-uses `@ag-ui/core`'s `EventType` enum and event shapes directly. Practical changes:

- `RunErrorEvent` is flat (`{ message, code }` at the top level) instead of nested under `error: {...}`.
- `TOOL_CALL_START` / `TOOL_CALL_END` events expose `toolCallName` (the deprecated `toolName` alias is retained as a passthrough for now).
- Adapters now emit `REASONING_*` events (`REASONING_START`, `REASONING_MESSAGE_START`, `REASONING_MESSAGE_CONTENT`, `REASONING_MESSAGE_END`, `REASONING_END`) alongside the legacy `STEP_*` events; consumers rendering thinking content should migrate to the `REASONING_*` channel.
- `TOOL_CALL_RESULT` events are emitted after tool execution in the agent loop.
- New `stripToSpecMiddleware` (always injected last) removes non-spec fields (`model`, `content`, `args`, `finishReason`, `usage`, `toolName`, `stepId`, …) from events before they reach consumers. Internal state management sees the full un-stripped chunks.
- `ChatOptions` gained optional `threadId` and `runId` for AG-UI run correlation; they flow through to `RUN_STARTED` / `RUN_FINISHED`.
- `StateDeltaEvent.delta` is now a JSON Patch `any[]` per the AG-UI spec.
