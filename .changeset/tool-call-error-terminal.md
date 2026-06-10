---
'@tanstack/ai-event-client': minor
'@tanstack/ai-client': minor
'@tanstack/ai': minor
---

Add an `'error'` terminal to `ToolCallState`. When a tool execution produces an output error, the StreamProcessor now transitions the `tool-call` part to `state: 'error'` instead of parking it at `'input-complete'`.

Previously an errored tool call left the tool-call part at `'input-complete'` forever, so UIs that render lifecycle from the part's `state` could not distinguish "still executing" from "failed" without reverse-engineering the error-shaped `output` or the sibling `tool-result` part. The new terminal makes the tool-call state machine self-describing and symmetric with `ToolResultState` (which already has `'error'`):

```ts
if (part.type === 'tool-call' && part.state === 'error') {
  // render failure — no more inferring from output shape
}
```

The completion safety net (`RUN_FINISHED` / stream finalization) no longer downgrades a failed tool call back to `'input-complete'`, including when an `output-error` result arrives before `TOOL_CALL_END`.
