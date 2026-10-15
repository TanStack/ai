---
'@tanstack/ai-harness': minor
---

Add first-party plugins in `@tanstack/ai-harness/plugins` (a Node entry):

- `permissions()`: rules for tools, paths, and commands, the `default`, `plan`, `acceptEdits`, and `bypass` modes, questions answered with once, always, or reject, saved "always" rules with `/permissions` and `/permissions forget <n>`, and `listSavedPermissions` / `deleteSavedPermission` for server code. The rules apply in subagent runs too.
- `agents()`: agent profiles with their own prompt, tools, model, rules, and step limit, in code or in Markdown files, `/agent` to switch the primary agent, and the built-in `build`, `plan`, `general`, and `explore` agents.
- `question()`, `todos()`, `title()`, `modelPicker()`, `projectInstructions()`, `fileCommands()`, `compact()`, `usage()` (with your own prices for calls that have no provider cost), and `boundToolOutput()`.

`PermissionRules`, `PermissionResources`, `PermissionDecisionCapability`, and `decidePermission` are also exported from the package root. They load no Node module, so an edge-safe plugin can read the permission rules.
