---
'@tanstack/ai-computer-sandbox': minor
'@tanstack/ai-sandbox': minor
---

`sandboxComputer()` takes a `snapshots` option. The driver saves the files of one folder, like a browser profile, when a thread closes or goes idle. It restores them into the next new sandbox of the thread, so a sign-in survives a sandbox that is gone. This works with every provider. Call `saveComputerSnapshot()` to save right away, for example after a sign-in.

`@tanstack/ai-sandbox` exports `captureSandboxFiles` and `restoreSandboxFiles`, the file capture and restore of portable snapshots.
