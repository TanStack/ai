---
'@tanstack/ai': minor
---

A router pick can give an agent its input. Anywhere a pick has a name, it can have `{ name, input }`, so `subagents.router` can start an agent with `inputSchema`. `chat()` checks the input against the schema before any child starts, and `run` reads it as `ctx.input`. A resume keeps each input of the plan. `subagentRoute` gets `needsInput(result)`, which lists the picked agents with an `inputSchema`, and `pick(result, { inputs })`, which puts each input on its name. `inputs` is typed from each schema. `chat()` throws when a pick gives an input to `main` or to an agent with no `inputSchema`, or gives one agent an input twice in one step. A resume fails when its saved plan is absent or an input no longer matches. The new `SubagentPick` type is exported.
