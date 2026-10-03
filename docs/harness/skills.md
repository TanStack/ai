---
title: Add skills to a harness
id: harness-skills
order: 10
description: "Give the harness model the skills in a list of folders, and make each skill a slash command. A skill that you add while the session runs works at once."
keywords:
  - tanstack ai
  - harness
  - skills
  - SKILL.md
  - slash commands
---

Your users keep skills as `SKILL.md` folders, in the repo and in their home folder, and they want to call them from your agent like any other command. The skills plugin reads those folders, gives the model the list of skills, and makes each skill a `/<name>` command. A skill that a user adds while the session runs works at once.

## 1. Add the plugin

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-skills
vue: @tanstack/ai-skills
solid: @tanstack/ai-skills
svelte: @tanstack/ai-skills
preact: @tanstack/ai-skills
angular: @tanstack/ai-skills
octane: @tanstack/ai-skills
vanilla: @tanstack/ai-skills

<!-- ::end:tabs -->

```ts group=harness-skills
import { homedir } from 'node:os'
import { join } from 'node:path'
import { defineHarness } from '@tanstack/ai-harness'
import { openaiText } from '@tanstack/ai-openai'
import { skills } from '@tanstack/ai-skills/harness'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-5.6'),
  plugins: () => [
    skills({
      dirs: ['./.agents/skills', join(homedir(), '.acme', 'skills')],
    }),
  ],
})
```

- `dirs` lists the skill folders. Each one holds skill folders with a `SKILL.md`.
- When two folders have a skill with the same name, the first folder wins. Put the repo folder first, so a project can replace a user's skill.
- A folder that does not exist yet is fine. Its skills show once the user makes it.

## 2. Call a skill

`/release-notes write them for v2` starts a turn with "Use the release-notes skill: write them for v2". The model loads the skill with `load_skill`, then does the task. `/release-notes` alone asks for the skill with no task.

The model also sees the list of skills, so it can load one on its own when a task matches.

## Names that are taken

A skill with the name of another command gets a prefix: a `model` skill is `/skill:model`, and `/model` stays the model picker. Pass `reserved` with the names that your UI handles itself:

```ts group=harness-skills
export const cliSkills = skills({
  dirs: ['./.agents/skills'],
  reserved: ['help', 'exit'],
})
```

`/skills` lists every skill, its folder, and its command.

## Skills that change while the session runs

The plugin watches the folders, and it lists them again at the start of each turn:

- A new `SKILL.md` adds its command.
- A removed skill takes its command away.
- An edited description updates the command.
- A broken `SKILL.md` is left out until it is fixed.

A UI built on `createSessionView` shows each change in its command list at once.

## Many skills

The model's list has one line for each skill: the name and the first sentence of the description. When the list is longer than `maxCatalogTokens` (default 4000), the skills of the earlier folders stay, and the rest leave the model's list. A skill that the user calls with its command always stays in it.

The other options of `withSkills` pass through, for example `maxCatalogTokens` and `requireApproval`:

```ts group=harness-skills
export const manySkills = skills({
  dirs: ['./.agents/skills'],
  maxCatalogTokens: 8000,
})
```

## What you have now

- The skills of your folders, in the model's list and as `/<name>` commands.
- New and changed skills that work in a running session, with no restart.

Next: [Agent Skills](../skills/agent-skills) has the `SKILL.md` format, and [Write a harness plugin](./plugins#change-commands-while-the-session-runs) shows the `ctx.commands` API that the plugin uses.
