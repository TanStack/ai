---
'@tanstack/openai-base': patch
---

Pass the full diff of a streamed `apply_patch` call to the app. The Responses API adds an `apply_patch_call` with `status: "in_progress"` and an empty `diff`, and streams the diff in before the item is done. The adapter ended the call when the item was added, so `execute` always got `diff: ""`, and an agent loop sent empty patches until it hit its iteration limit. A user-run call (`apply_patch`, `local_shell`, `shell`, `computer`) now starts when its item is added and ends, with its input, once the item is no longer in progress, as function calls already do.
