---
'@tanstack/ai-harness': minor
'@tanstack/ai-persistence': minor
'@tanstack/ai-sandbox': minor
'@tanstack/ai-mcp': minor
'@tanstack/ai-code-mode': minor
---

Session lists, coding tools, and safer clients for the harness.

- **Session index.** `host.sessions` lists, renames, deletes, and forks sessions (`fork(harness, threadId, { before | through })`). `host.fork` takes `at: null` to copy no messages. `host.events()` is a status feed (`running`, `waiting`, `idle`). Over HTTP: `GET sessions`, `POST sessions`, and `GET host-events`. Subagent runs show up as child sessions of their thread. `@tanstack/ai-persistence` adds the `SessionIndexStore` contract, a memory store, and conformance tests.
- **Waiting inputs.** `session.inputs()` lists them. The `cancelInput` and `setDelivery` inputs cancel one or move it between steer and queue.
- **Coding tools** in the new Node entry `@tanstack/ai-harness/plugins/coding`: `workspaceTools` (moved here) gives `read_file` (text pages, images, PDFs), `write_file`, `edit_file` or `patch` (`editStyle`), `list_files`, `grep`, `bash` (with `background`), `webfetch`, and `websearch`. A `WorkspaceBackend` runs them on the host or in a sandbox (`sandboxWorkspaceBackend` from `@tanstack/ai-sandbox/harness`). Also new here: `snapshots()` with `/undo` and `/redo`, and `formatter()`. `@vscode/ripgrep` and `turndown` are optional peers.
- **More plugins** in `@tanstack/ai-harness/plugins`: `agents()` (profiles, Markdown agents, `/agent`, and a step limit), `question()`, `title()`, and `boundToolOutput`. `projectInstructions()` reads up to the repo root and adds an environment block. `usage()` shows `session.usage()` and prices only the calls with no provider cost.
- **Permissions.** Rules can match the paths and commands that a call touches (`PermissionResources`). Questions take once, always, or reject with a message. The rules apply in subagent runs too. `webfetch` asks by default. `PermissionDecisionCapability` lets other plugins ask what `permissions()` decides, and code mode uses it.
- **Clients set only what you expose.** `defineHarness({ expose: { config, commands } })`. A client config input or command outside these lists gets `not_exposed`, so a client cannot switch the permission mode to `bypass`. Nothing is exposed by default, and server code is not affected. The harness MCP server also makes tools only for exposed commands.
- **`mcp()` harness plugin** in `@tanstack/ai-mcp/harness`: MCP servers by name, tools named `<server>_<tool>`, `/mcp` status, and `codeMode: true`.
- **Code mode** moves a tool marked `metadata.codeMode` only when `permissions()` allows it in plan mode, and never moves a tool that declares permission resources.
- **Plugin API.** `ctx.session.note(text, { wake })`, `ctx.session.entry()` and `updateEntry(patch)`, `prepareTools({ tools, model })`, and the `WorkspaceHooks` extension point. `ctx.collect()` now works with every array method.
