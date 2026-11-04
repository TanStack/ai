---
'@tanstack/ai-harness': patch
---

The `list_files` and `grep` commands now get the abort signal of the tool call. `harnessText` now cancels the inner turn, or the remote turn, when the caller stops reading the stream early.
