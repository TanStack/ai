---
'@tanstack/ai-harness': minor
---

`workspaceTools({ root, outside: 'ask' })`: a path outside the workspace asks the user first, and a yes allows that folder for the rest of the session. The `bypass` mode allows it without a question. `list_files` and `grep` take an optional `path`, so the agent can search an allowed folder. Without the option, a path outside the workspace is refused, as before.
