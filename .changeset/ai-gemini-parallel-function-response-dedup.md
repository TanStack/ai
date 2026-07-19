---
"@tanstack/ai-gemini": patch
---

Fix parallel functionResponse dedup dropping same-tool calls (#894)

`GeminiTextAdapter.mergeConsecutiveSameRoleMessages` deduplicated
`functionResponse` parts by tool **name** instead of by **id**. When Gemini
returned two or more parallel calls to the same tool in one turn, the second
matching response was filtered out, so the follow-up request failed with:

> 400 INVALID_ARGUMENT: Please ensure that the number of function response
> parts is equal to the number of function call parts of the function call turn.

Each `functionResponse` is already built with a unique `id` (the originating
`toolCallId`), so keying the dedup on `id` keeps parallel calls distinct
(different ids → both kept) while still collapsing a genuine duplicate
(same id → second one dropped). The pre-existing comment already described
the key as "tool call ID" — this brings the implementation in line with
that comment.
