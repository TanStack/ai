---
'@tanstack/ai-computer-sandbox': minor
---

Add the `sandboxIds` option to `sandboxComputer()`. It keeps the sandbox of each thread and reconnects to it later with `provider.resume`, so a user who comes back to a thread gets the same desktop. A kept sandbox is not destroyed when its thread closes or goes idle.
