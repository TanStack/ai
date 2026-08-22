---
'@tanstack/ai-gemini': patch
---

Fix `mergeConsecutiveSameRoleMessages` deduplicating `functionResponse` parts by `name` instead of `id`. Two parallel calls to the same tool in one turn share a `name` but have distinct ids, so the second response was silently dropped, leaving Gemini with fewer response parts than call parts on the next request (`400 INVALID_ARGUMENT: ... number of function response parts is equal to the number of function call parts`). Deduping by `id` still collapses a genuine duplicate tool result while preserving both responses for same-tool parallel calls.
