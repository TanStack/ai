---
'@tanstack/ai-claude-code': patch
---

`@tanstack/ai-claude-code` now sets `"sideEffects": false`. When an app imports only `translateSdkStream`, a bundler can drop the unused adapter modules.
