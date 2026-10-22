---
'@tanstack/ai-harness': minor
---

`write_file`, `edit_file`, and `patch` send `FileChanged` (`tanstack/workspace-tools:file-changed`) with a unified patch and its line counts for each file that they change. At the end of each model step, `snapshots()` sends it for the files that other tools, like `bash`, changed: at most 100 for each step.
