---
'@tanstack/ai': minor
'@tanstack/ai-harness': minor
---

`@tanstack/ai`: a router pick can give an agent its input. Anywhere a pick has a name, it can have `{ name, input }`, so `subagents.router` can start an agent with `inputSchema`. `chat()` checks the input against the schema, and `run` reads it as `ctx.input`. A resume keeps each input of the plan. `subagentRoute` gets `needsInput(result)`, which lists the picked agents with an `inputSchema`, and `pick(result, { inputs })`, which puts each input on its name. `inputs` is typed from each schema.

`@tanstack/ai-harness`: `defineHarness` takes `routing: { router, order, strategy, limits, sandbox }`. The router runs at the start of each new turn. It sends the turn to the main model, or to root agents: the harness `agents` and the `agents` of plugins. Its context has the fields of the `subagents.router` context, plus `session`, `input`, `operationId`, `inputId`, and `adapter`. With `strategy: 'handoff'`, the main model answers after the agents, in the same turn, and the `turn` hooks run for it. A resolve continues the routed plan without a new router call. A routed turn holds a run lease, and its text is the text of the agents. A `subagents.router` turn gets the same lease and text, and a child that stops for an interrupt resumes on `resolve`. `HarnessRouting` and `HarnessRouterContext` are exported.
