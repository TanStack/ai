---
'@tanstack/ai': patch
---

Fix StreamProcessor dropping the first text delta of a post-tool segment. When an assistant turn opened with a tool call and then spoke, the message auto-created by `TOOL_CALL_START` left `hasToolCallsSinceTextStart` set through `TEXT_MESSAGE_START`, so the segment reset fired one delta late and folded away the first `TEXT_MESSAGE_CONTENT` chunk (e.g. losing the first word of the reply). The segment reset now runs on the first post-tool delta regardless of whether the prior segment was empty, and only the flush of a non-empty prior segment stays gated.
