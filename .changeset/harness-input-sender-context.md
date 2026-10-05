---
'@tanstack/ai-harness': minor
'@tanstack/ai-persistence': patch
'@tanstack/ai-mcp': patch
---

Each harness input carries its sender and its context.

- `prompt`, `steer`, `followUp` and `resolve` take `principal`. Without it, the input belongs to the principal that opened the session. `createHarnessHandler` and `handleHarnessSocket` run each input, and each command, as the principal that `authorize` returned for its request.
- The log keeps the sender of each input. The turn's tools, `ctx.session.principal`, `ctx.credentials` and `ctx.keys` use the turn's sender. A turn that waits for a sign-in continues only when its sender signs in.
- `turn.canJoin` gets the `principal` of each waiting input and the `turnPrincipal` of the running turn, so it can keep one person's message out of another person's turn. The `routing.router` context gets `principal` and `context`.
- Without `turn.canJoin`, a waiting message joins the running turn only when the same person sent both. A message from another person waits and runs as its own turn, as its sender.
- A command acts for the person who runs it: its `session.principal` is that person, and `session.prompt` from a command runs as that person. The wake turn after a background agent runs as the person who started the agent.
- `Principal.tenantId` goes into the credential scope, so two organizations' credentials for one user stay apart.
- A credential read finds the user's own credential first, then the tenant's (saved without a `userId`), so one key can serve a whole organization. Saves and deletes change the user's own credential only.
- `prompt`, `steer` and `followUp` take `context`: JSON data from the client, stored with the input and kept after a restart. `POST run` fills it from AG-UI `forwardedProps`. Tools get it merged with `HarnessConfig.context`, and the harness value wins for a key in both.
- A plugin `adapter(turn)` gets `TurnInfo`: the turn's `message`, `context`, `principal`, `inputId` and `overrides`. A plugin with `lifetime: 'turn'` gets the same as `ctx.turn` in `setup`.
- `CommandContext` has `principal` and `credentials` of the principal that ran the command.
- In `@tanstack/ai-persistence`, a stored input's `principal` can carry `tenantId`.
- `mcpConnector` keeps its sign-in state, client and tools per sender, so one person's MCP sign-in is not used for another person's turn.
