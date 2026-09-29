---
'@tanstack/ai-harness': minor
'@tanstack/ai-harness-cli': patch
---

Users of a shipped harness can connect their own model provider in the app, with no `.env` file. The new `providerKeys({ providers })` plugin in `@tanstack/ai-harness/plugins` adds `/connect <id>`, `/disconnect <id>`, and `/keys`. `/connect` runs the provider's `signIn` when it has one, or else asks the user to paste the key. The key is saved in the credential store of the user. `/keys` and the plugin state show where each key comes from: a saved key (the last 4 characters only), the env var, or no key.

`defineHarness({ adapter })`, the `modelPicker` choices, `compact({ adapter })`, and `goal({ judge })` now accept a `keyedAdapter(...)`. The session builds it with the user's key just before each call. The saved key comes first, then the provider's env var. When there is no key, the turn stops with `harness.auth_required`, so the user sees `/connect <id>`. Agents get the same keys as `ctx.keys`, and plugins get them as `ctx.keys` on their setup context.

A `Question` can set `secret: true`. The view gives it as `ViewQuestion.secret`, and the session does not keep a secret answer in the inbox. In a terminal, the CLI line mode hides what the user types for a secret question, and it never prints the answer.
