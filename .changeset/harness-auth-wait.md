---
'@tanstack/ai': patch
'@tanstack/ai-harness': minor
---

A turn can wait for a sign-in and then go on.

- `ctx.credentials.require(id, { wait: true })`, and `token({ wait: true })` in an `oauthConnector`, stop the running chat turn with an interrupt whose `reason` is `'auth_required'`. Its payload has the connector id.
- When the credential is saved (the `connect:<id>` command, `/connect`, or `ctx.credentials.set`), the same turn goes on and the tool runs again. No new prompt is needed. On a durable host this also works after a restart.
- A resolve with `status: 'cancelled'` gives up: the tool fails as it does without `wait`.
- In `@tanstack/ai`, a tool that throws the MCP input-required shape can set the interrupt `reason`. MCP interrupts still use `'mcp_input'`.
