---
'@tanstack/ai-harness': minor
'@tanstack/ai-skills': minor
'@tanstack/ai-code-mode': minor
---

Skills in a harness, live commands, and lazy code-mode tools.

- `@tanstack/ai-skills/harness`: the new `skills({ dirs })` plugin gives the harness model the skills of a list of folders, and makes each skill a `/<name>` command that starts a turn with that skill. A skill with the name of another command is `/skill:<name>`, and `/skills` lists them. The plugin watches the folders, so a skill that you add or remove while the session runs changes the commands at once.
- `@tanstack/ai-harness`: `ctx.commands` (`has`, `set`, `delete`, `ready`) lets a plugin add and remove its commands while the session runs. Each change sends a `harness.commands.changed` event, and session views read the command list again.
- `@tanstack/ai-code-mode`: `codeMode({ lazy: true })` makes each tool that moves into code mode lazy. The prompt lists only the tool names, and the model asks `discover_tools` for the signatures before it calls them.
