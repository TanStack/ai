---
'@tanstack/ai-harness': minor
---

Add coding tools in the new Node entry `@tanstack/ai-harness/plugins/coding`:

- `workspaceTools({ root })` gives `read_file` (text pages, images, PDFs), `write_file`, `edit_file` or `patch` (`editStyle`), `list_files`, `grep`, `bash` (with `background`), `webfetch`, and `websearch` (with a `SearchProvider`). With `permissions()`, edits, `bash`, and `webfetch` ask first, and the rules also apply to the real path of a link. `outside: 'ask'` asks before a path outside `root`. The `cwd` thread setting gives each thread its own working folder.
- A `WorkspaceBackend` runs the tools. `hostBackend` is the default. On Windows, commands do not run a program from the working folder by its name.
- `snapshots()` adds `/undo` and `/redo`, which restore only the files of the turn (git 2.26 or newer), file restore for `session.revert()`, and a diff for each model step.
- `formatter()` formats each written file with the formatter of the project. With `permissions()`, each run asks first.
- `WorkspaceHooks` lets other plugins run code after a read or a write.

`@vscode/ripgrep` and `turndown` are optional peer dependencies.
