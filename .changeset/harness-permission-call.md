---
'@tanstack/ai-harness': minor
---

`PermissionCallCapability` gives a plugin that runs tool calls itself, like code mode, the decision that `permissions()` makes for one call: `allow`, `deny` with the error that the model gets, or `ask` with the approval question. It uses the current mode, the saved `always` answers, and the resources of the call args, and `settle(reply)` applies the user's answer as a direct approval does.
