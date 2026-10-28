---
title: Portable Agent Skills
id: portable-agent-skills
order: 1
description: "Give any tool-calling model a library of SKILL.md skills that it loads when it needs them, on any provider, with the withSkills middleware."
keywords:
  - tanstack ai
  - agent skills
  - SKILL.md
  - portable skills
  - withSkills
  - load_skill
  - skill catalog
---

`withSkills` lets the model pick one `SKILL.md` for the turn. The other skills stay out of the system prompt.

`withSkills` from `@tanstack/ai-skills` gives the model a short catalog of your skills and a `load_skill` tool. The model loads the full instructions only when it needs them.

> [!NOTE]
> This is the portable path. It runs on the model you already use and needs no provider sandbox. For skills that run in a provider sandbox, see [Provider Skills](../tools/provider-skills). You cannot mix the two in one call. See [Portable vs hosted](../tools/provider-skills#portable-vs-hosted-skills).

## Quick setup

### 1. Install the package

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

### 2. Add a skill to the server route

Define a skill inline. Then pass it to `withSkills` in the `middleware` array:

```ts
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { inlineSkill, withSkills } from '@tanstack/ai-skills'

const pptx = inlineSkill({
  name: 'pptx-builder',
  description: 'Build and edit PowerPoint decks with python-pptx.',
  instructions: `
# Building a deck
Use python-pptx. Open or create the presentation, edit slides, then save.
Keep one idea per slide.
`,
})

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: anthropicText('claude-sonnet-5-5'),
    messages: params.messages,
    threadId: params.threadId,
    middleware: [withSkills(pptx)],
  })
  return toServerSentEventsResponse(stream)
}
```

Your client does not change. Ask the chat for a slide deck. The model calls `load_skill` with `pptx-builder` and then follows the instructions.

## How it works

`withSkills` adds two things to each request:

- **A catalog** in the system prompt, with one line per skill (name and description).
- **A `load_skill` tool.** Its `name` input accepts only your skill names, so the model cannot invent one. The tool returns the skill body without its frontmatter, and a list of the bundled resources.

If the model loads the same skill twice in one conversation, the second call returns a short "already loaded" marker, not the full body again.

## Offer more than one skill

Pass an array. `withSkills` sorts the skills by name and removes duplicates:

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { inlineSkill, withSkills } from '@tanstack/ai-skills'

const pptx = inlineSkill({
  name: 'pptx-builder',
  description: 'Build and edit PowerPoint decks with python-pptx.',
  instructions: '# Building a deck\nUse python-pptx. Edit slides, then save.',
})

const brand = inlineSkill({
  name: 'brand-voice',
  description: 'Write in the company brand voice.',
  instructions: '# Brand voice\nWarm, direct, no jargon.',
})

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: anthropicText('claude-sonnet-5-5'),
    messages: params.messages,
    threadId: params.threadId,
    middleware: [withSkills([pptx, brand])],
  })
  return toServerSentEventsResponse(stream)
}
```

Most apps keep skills in a folder, a build-time bundle, or a database, not in code. See [Skill sources](./skill-sources).

## Let the model read a skill's files

Some skills bundle reference files, such as a style guide or a field map. To let the model read them, add `createResourceTool` to `tools`. `withSkills` finds it and tells the model that it can call `read_skill_resource`:

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { createResourceTool, inlineSkill, withSkills } from '@tanstack/ai-skills'

const pdf = inlineSkill({
  name: 'pdf-filler',
  description: 'Fill a PDF form from a data object.',
  instructions: '# Fill a PDF\nSee references/fields.md for the field map.',
  resources: { 'references/fields.md': 'name -> field_1\nemail -> field_2' },
})

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: anthropicText('claude-sonnet-5-5'),
    messages: params.messages,
    threadId: params.threadId,
    tools: [createResourceTool(pdf)],
    middleware: [withSkills(pdf)],
  })
  return toServerSentEventsResponse(stream)
}
```

Without the resource tool, the `load_skill` result still lists the resources. The model is told that it cannot load them in this setup.

## Run a skill's scripts

Some skills ship scripts, or tell the model to "run `python3 extract.py`". `withSkills` lists those scripts in the `load_skill` result, but it does not run them. Your app runs code through a tool that you supply.

Add an execution tool to `chat()`. Then write the skill so that it tells the model to call that tool:

```ts ignore
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
  toolDefinition,
} from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { inlineSkill, withSkills } from '@tanstack/ai-skills'
import { z } from 'zod'

// Your own execution tool. Run the command in a provider sandbox, a local
// isolate, or a serverless worker. Guard it in production.
const executeShell = toolDefinition({
  name: 'execute_shell',
  description: 'Run a shell command and return its stdout.',
  inputSchema: z.object({ command: z.string() }),
  outputSchema: z.object({ stdout: z.string() }),
}).server(async ({ command }) => {
  const { stdout } = await runInYourSandbox(command)
  return { stdout }
})

const extractPdf = inlineSkill({
  name: 'pdf-extract',
  description: 'Extract text from a PDF with a small Python script.',
  instructions: `
# Extract PDF text
Run this with the execute_shell tool, then return the text it prints:
  python3 -c "import sys, pypdf; ..."
`,
})

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: anthropicText('claude-sonnet-5-5'),
    messages: params.messages,
    threadId: params.threadId,
    tools: [executeShell],
    middleware: [withSkills(extractPdf)],
  })
  return toServerSentEventsResponse(stream)
}
```

You can replace `execute_shell` with any tool: a container runner, a Code Mode sandbox, or a remote worker. The skill stays the same.

## Advanced

### Catalog options

`withSkills(sources, options)` accepts these options:

| Option | Default | What it does |
| --- | --- | --- |
| `maxCatalogTokens` | `4000` | The token limit for the catalog. |
| `onLimitExceeded` | `'error'` | When the catalog is over the limit: `'error'` throws. A function `(skills, limit) => skills` returns a smaller list. |
| `requireApproval` | `false` | Asks a human to approve before `load_skill` or `read_skill_resource` runs. |
| `catalogPlacement` | `'system'` | Where the catalog goes: `'system'` or `'tool-description'`. |
| `renderCatalog` | Per model family | `(skills, family) => string`. Writes the catalog text yourself. |
| `instructionTemplate` | Per model family | A template string that must contain `{skills}`. Escape literal braces as `{{` and `}}`. |

```ts ignore
withSkills(sources, {
  maxCatalogTokens: 4000,
  requireApproval: true,
})
```

Do not pass both `renderCatalog` and `instructionTemplate`. If you pass both, `withSkills` throws.

### Catalog format per model family

By default, Anthropic models get the `<available_skills>` XML format that they are tuned for. All other models get a plain markdown list.

### Next pages

- [Skill sources](./skill-sources): load skills from a folder, a build-time bundle, or your own store.
- [Write a skill source](./writing-adapters): back skills with S3, a database, or a registry.
