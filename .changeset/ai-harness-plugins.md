---
'@tanstack/ai-harness': minor
---

Add first-party plugins. `@tanstack/ai-harness/plugins` loads no Node module. The plugins that read files are in the Node entry `@tanstack/ai-harness/plugins/node`.

- `permissions()`: rules for tools, paths, and commands, and the `default`, `plan`, `acceptEdits`, and `bypass` modes. It decides every call of a model message before the calls run, and opens one approval wait for each call that asks, so the turn stops and no process waits. An answer is `true` or `false`, `'once'`, `'always'`, or `'reject'`, or `{ answer, message? }`. It also has saved "always" rules with `/permissions` and `/permissions forget <n>`, and `listSavedPermissions` / `deleteSavedPermission` for server code. The rules apply in subagent runs too.
- `agents()` (in `plugins/node`): agent profiles with their own prompt, tools, model, rules, and step limit, in code or in Markdown files, `/agent` to switch the primary agent, and the built-in `build`, `plan`, `general`, and `explore` agents.
- `question()`: a `question` tool for the lead turn. Each question is a wait of the turn, answered with `resolve`. Agent runs do not get the tool.
- `todos()`, `title()`, `modelPicker()`, `compact()`, and `usage()` (with your own prices for calls that have no provider cost).
- `projectInstructions()`, `fileCommands()`, and `boundToolOutput()`, in `plugins/node`.

`PermissionRules`, `PermissionResources`, `PermissionDecisionCapability`, and `decidePermission` are also exported from the package root. They load no Node module, so an edge-safe plugin can read the permission rules.
