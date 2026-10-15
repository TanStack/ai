---
'@tanstack/ai-harness': minor
---

Add the `providerKeys({ providers })` plugin to `@tanstack/ai-harness/plugins`. Users of a shipped harness connect their own model provider in the app, with no `.env` file. It adds `/connect:<id>`, `/disconnect:<id>`, and `/keys`. `/connect:<id>` runs the provider's `signIn` when it has one, else it opens `keyUrl` when set and asks the user to paste the key as a secret question. The key is saved in the credential store of the user, and a `keyedAdapter(...)` for that provider uses it. `/keys` and the plugin state show where each key comes from: a saved key (the last 4 characters only), the env var, or no key.
