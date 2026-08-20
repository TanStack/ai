---
'@tanstack/ai-sandbox': minor
---

Add portable sandbox checkpoints. `createSandboxSnapshots` and `memorySandboxSnapshots` return one object with `save`, `fork`, and `readArtifact`. `createSnapshotTools` turns those methods into host tools bound to the route `threadId`.
