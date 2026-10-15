---
'@tanstack/ai': patch
'@tanstack/ai-persistence': patch
---

Fix subagent limit and continue edges.

- A background `start` that throws gives the `maxCalls` slot back. `maxConcurrent` counts that child until `done` settles. `start` now returns `done`.
- A schema result that is not an object does not drop `sessionId` or `background`. A top-level `anyOf` schema still shows those fields.
- A suspended child with no stored `base` keeps its transcript.
- When the parent deadline is already past, the model gets `subagent limit reached (no time left)`.
