---
'@tanstack/ai-harness': minor
'@tanstack/ai-harness-cli': minor
---

`createHarnessHost({ credentials })` takes the `CredentialStore` (from `@tanstack/ai/byok`) where users' API keys and OAuth sign-ins are saved. Without it, credentials stay in memory until the process stops. `runCli` takes the same `credentials` option.
