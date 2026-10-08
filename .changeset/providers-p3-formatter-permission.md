---
'@tanstack/ai-harness': patch
---

`formatter()` now asks before it runs, when `permissions()` is mounted. A formatter runs code from the project, and the model can edit that code. Each run is named `formatter:<name>`, for example `formatter:prettier`. It asks in the `default` and `acceptEdits` modes, runs in `bypass`, and does not run in `plan`. An `always` answer saves the rule for the project. A `reject` keeps the write, and the tool result says that the formatter did not run. Workspace `afterWrite` hooks can now return text for the tool result.
