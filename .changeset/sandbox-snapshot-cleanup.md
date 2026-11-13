---
'@tanstack/ai-sandbox': minor
'@tanstack/ai-sandbox-railway': minor
'@tanstack/ai-sandbox-e2b': minor
'@tanstack/ai-sandbox-boxd': minor
---

Stop native sandbox snapshots from piling up, and stop a failed snapshot from leaking its sandbox.

`SandboxProvider` has a new optional `deleteSnapshot({ snapshotId, signal })`. `defineSandbox` calls it, best effort, when a sandbox record's `latestSnapshotId` is replaced (a re-create or a new `after-run` snapshot) and when the sandbox is torn down through `destroy` or `reclaimSandbox`. A failed delete is logged and never fails the run or the teardown.

The `after-setup` snapshot no longer fails `ensure()`. Before, a snapshot error (for example a provider quota) was thrown after the sandbox was created and bootstrapped but before it was recorded, so the sandbox kept running with nothing pointing at it. Now the error is logged and the run continues without a snapshot. If writing the instance record fails, the new sandbox is destroyed.

`railwaySandbox()` implements `deleteSnapshot`, so its `tsai-*` checkpoints are deleted when they go stale instead of counting against the environment's checkpoint cap until pruned by hand. `e2bSandbox()` and `boxdSandbox()` implement it too.
