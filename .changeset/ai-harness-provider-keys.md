---
'@tanstack/ai-harness': minor
---

Add the `providerKeys({ providers })` plugin to `@tanstack/ai-harness/plugins`. Users of a shipped harness connect their own model provider in the app, with no `.env` file. It adds `/connect:<id>`, `/disconnect:<id>`, and `/keys`. `/connect:<id>` runs the provider's `signIn` when it has one, else it opens `keyUrl` when set and asks the user to paste the key with `step.ask` and `secret: true`. The log keeps the question as a wait, so a user on any host can answer it, and the log never keeps the key. The key is saved in the credential store of the user, and a `keyedAdapter(...)` for that provider uses it. `/keys` shows where each key of the user comes from: a saved key (the last 4 characters only), the env var, or no key. The plugin state shows only the env vars that the session reads, as every member of the thread reads it. On a host with access without `allowServerEnvKeys`, no env var counts.
