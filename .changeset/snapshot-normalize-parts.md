---
'@tanstack/ai': patch
---

Fix `MESSAGES_SNAPSHOT` handling so AG-UI snapshot messages are normalized into `UIMessage[]`.

AG-UI snapshot messages use the wire shape `{ id, role, content }` and have no `parts` array. The handler previously cast them straight to `UIMessage[]`, so any code that later read `message.parts` (e.g. the devtools `onToolCallStateChange` handler) crashed with `TypeError: Cannot read properties of undefined (reading 'find')`.

Each snapshot message is now converted to a proper `UIMessage` via a type-safe converter that preserves the original AG-UI `id` (so subsequent `TEXT_MESSAGE_CONTENT` / `TOOL_CALL_*` events still route by `messageId`), maps `toolCalls` to `tool-call` parts and `tool` messages to `tool-result` parts, and falls back to a generated id only when the snapshot omits one.
