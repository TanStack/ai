---
'@tanstack/ai-harness': minor
---

Add first-party plugins. `@tanstack/ai-harness/plugins` loads no Node module. The plugins that read files are in the Node entry `@tanstack/ai-harness/plugins/node`.

- `permissions()`: rules for tools, paths, and commands, and the `default`, `plan`, `acceptEdits`, and `bypass` modes. It decides every call of a model message before the calls run, and opens one approval wait for each call that asks, so the turn stops and no process waits. An answer is `true` or `false`, `'once'`, `'always'`, or `'reject'`, or `{ answer, message? }`. It also has saved "always" rules with `/permissions` and `/permissions forget <n>`, and `listSavedPermissions` / `deleteSavedPermission` for server code. The rules apply in subagent runs too. It decides in `onGuardToolCall`, on the final checked arguments.
- `agents()` (in `plugins/node`): agent profiles with their own prompt, tools, model, rules, and step limit, in code or in Markdown files, `/agent` to switch the primary agent, and the built-in `build`, `plan`, `general`, and `explore` agents. A subagent run uses the tools and the model of the turn that started it. A run whose turn is not in the memory of this host fails with a clear error. A run that code starts needs a profile `model`.
- `question()`: a `question` tool for the lead turn. Each question is a wait of the turn, answered with `resolve`. Agent runs do not get the tool.
- `todos()`, `title()`, `modelPicker()`, `compact()`, and `usage()` (with your own prices for calls that have no provider cost).
- `goal()` runs each turn as the user who set the goal.
- `projectInstructions()`, `fileCommands()`, and `boundToolOutput()`, in `plugins/node`.

A plugin runs agents with `ctx.agents.start`, `ctx.agents.run`, and `ctx.agents.group({ concurrency }, (g) => [g.start(agent, input)])`, with the same types as `ctx.harness.agents` in agent code.

`PermissionRules`, `PermissionResources`, `PermissionDecisionCapability`, and `decidePermission` are also exported from the package root. They load no Node module, so an edge-safe plugin can read the permission rules.

`ctx.model.chat({ adapter, options, label, run, timeoutMs })` calls a model from a plugin, for example a judge or a title. It uses the keys of the user of the run, the budget of the run applies, and it stops when the run stops or after `timeoutMs` (default 2 minutes). Its usage counts in the session under `plugin:<name>` in `session.usage().bySource`. `goal()`, `title()`, and `compact()` call their models this way, with the labels `judge`, `title`, and `compact`.
