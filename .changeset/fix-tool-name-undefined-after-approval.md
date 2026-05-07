---
'@tanstack/ai': patch
---

Fix `tool_use.name: String should have at least 1 character` 400 from Anthropic when sending a follow-up message after approving a tool that needs approval (issue #532).

The agent loop's continuation re-emit of `TOOL_CALL_START` after a server-side post-approval execution now includes the AG-UI spec field `toolCallName` alongside the deprecated `toolName` alias, so the client's `StreamProcessor` records a tool-call part with a defined `name` instead of `undefined`. As a defensive measure, `StreamProcessor` also accepts the deprecated `toolName` field as a fallback when `toolCallName` is missing.

The post-approval execution also now replaces the `pendingExecution: true` placeholder tool message in the agent loop's message history with the real tool result, instead of appending a duplicate. This prevents the Anthropic adapter's `tool_result` de-dup (which keeps the first match) from discarding the real result, so the model sees the actual tool output during the post-approval streaming response.
