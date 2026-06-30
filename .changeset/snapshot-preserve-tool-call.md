---
'@tanstack/ai': patch
---

Fix `addToolResult` / `addToolOutput` silently no-op'ing after a `MESSAGES_SNAPSHOT`. The AG-UI snapshot wire shape cannot reconstruct client-side tool-call metadata a server may omit (a `role: 'tool'` message only carries `toolCallId` + `content`, and an assistant message may drop `toolCalls` the client already observed via `TOOL_CALL_*` events). `handleMessagesSnapshotEvent` now runs a reconciliation pass that anchors detached `tool-result`-only assistant messages into the preceding assistant message (matching the streaming fan-out shape) and carries forward a `tool-call` part from the pre-snapshot state when the snapshot references its `toolCallId` via a `tool-result` but omits the corresponding `tool-call` part. This keeps the UI representation consistent and lets a subsequent `addToolResult(toolCallId)` locate the call. Fixes #859.
