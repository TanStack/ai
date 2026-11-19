---
'@tanstack/ai-sandbox': minor
'@tanstack/ai-sandbox-railway': minor
---

Delete native sandbox snapshots once nothing references them.

`SandboxProvider` has a new optional `deleteSnapshot({ snapshotId, signal })`. `defineSandbox` calls it, best effort, when a sandbox record's `latestSnapshotId` is replaced (a re-create or a new `after-run` snapshot) and when the sandbox is torn down through `destroy` or `reclaimSandbox`. A failed delete is logged and never fails the run or the teardown. Providers that don't implement it behave as before.

`railwaySandbox()` implements `deleteSnapshot`, so its `tsai-*` checkpoints are deleted once nothing references them instead of staying in the environment until pruned by hand.
