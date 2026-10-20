---
'@tanstack/ai-skills': minor
---

`@tanstack/ai-skills/harness`: the new `skills({ dirs })` plugin gives the harness model the skills of a list of folders, and makes each skill a `/<name>` command that starts a turn with that skill. A skill with the name of another command is `/skill:<name>`, and `/skills` lists them. The plugin watches the folders, so a skill that you add or remove while the session runs changes the commands at once. The watcher lives as long as the host, every session that uses the same `skills()` object shares it, and a change makes each session read the folders again. A skill that does not load gets a fallback message.
