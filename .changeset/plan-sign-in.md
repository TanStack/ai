---
'@tanstack/ai-sandbox': minor
'@tanstack/ai-harness': minor
'@tanstack/ai-codex': minor
'@tanstack/ai-grok-build': minor
---

Users of a local harness can sign in with their own ChatGPT or SuperGrok plan. Add `login: codexPlanLogin()` or `login: grokBuildPlanLogin()` to the provider in `providerKeys`, and `/connect:codex` or `/connect:grok-build` runs the device sign-in of the vendor CLI.

With `authMode: 'host'`, Codex and Grok Build run the CLI without its API key variables, and a Docker or cloud sandbox gets a copy of the machine login for each run. `@tanstack/ai-sandbox/host-login` has the shared `cliPlanLogin` and `mountHostLogin` helpers.
