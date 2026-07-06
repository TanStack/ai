---
'@tanstack/ai': patch
---

Rename message ids atomically across all id-keyed processor state, fixing a silently dropped tool
result. When a tool call streams before any text and without `parentMessageId` (which the AG-UI spec
allows to be optional), the `StreamProcessor` creates a placeholder assistant message and later
renames it to the real provider id on `TEXT_MESSAGE_START`. That rename updated `messages`,
`messageStates`, and `activeMessageIds` but not `toolCallToMessage` / `structuredMessageIds` /
`structuredOutputUpdateBatches`, so a `TOOL_CALL_RESULT` arriving after the rename resolved to the
vanished placeholder id and was discarded. The rename now goes through a single `renameMessageId`
seam that remaps every id-keyed structure (the same set enumerated by `pruneToMessages()` and
`reset()`), so no adapter that legitimately omits `parentMessageId` can orphan a tool result.
