---
'@tanstack/ai': minor
'@tanstack/ai-harness': minor
---

One prompt can now run with its own settings.

- `session.prompt(message, { overrides })` and `session.followUp(message, { overrides })` take `TurnOverrides`: an `adapter`, `reasoning`, a `promptCache`, and extra `tools` for that one turn. They apply to every model call of the turn: the tool loop, `onModelError` retries, `beforeFinish` cycles, and joins. The next turn uses the defaults again.
- The overrides are kept in memory only. A queued turn keeps them, a steer that joins a turn uses that turn's overrides, and a turn that recovery runs again after a restart uses the defaults.
- A middleware that rebuilds the tools in `onConfig` keeps the override tools. A durable tool among them gets `step` and `append`.
- `HarnessConfig.reasoning` sets the default reasoning of every turn.
- The plugin `adapter` picker now gets the turn: `{ operationId, inputId, overrides }`. A picker with no parameter still works.
- `ChatMiddlewareConfig` has `promptCache`, next to `reasoning`. `onConfig` can change the prompt cache of the next model call.
