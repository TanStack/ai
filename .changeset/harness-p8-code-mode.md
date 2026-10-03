---
'@tanstack/ai-code-mode': minor
'@tanstack/ai-harness': minor
---

`@tanstack/ai-code-mode/harness` adds `codeMode({ driver })`: a harness plugin that gives the model one `execute_typescript` tool. The model writes a program that calls several tools, and the program runs in the isolate of any `@tanstack/ai-isolate-*` driver. Read-only tools move into code mode, including MCP tools found after sign-in. Tools that need approval, edits, and commands stay normal tool calls. Tool names that are not JavaScript identifiers (for example `notion-search`) get a safe name inside the program.

`@tanstack/ai-harness` adds `prepareTools` to plugins, to change the tool list of each turn. `PermissionRules` and `decidePermission` are now also exported from the package root.
