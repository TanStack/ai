---
title: Portable Agent Skills
id: portable-agent-skills
order: 1
description: "Give any tool-calling model a library of SKILL.md skills it can load on demand, on any provider, with the withSkills middleware from @tanstack/ai-skills."
keywords:
  - tanstack ai
  - agent skills
  - SKILL.md
  - portable skills
  - withSkills
  - load_skill
  - skill catalog
---

You have a set of `SKILL.md` files: reusable instructions that teach a model how
to do one thing well (build a slide deck, follow your brand voice, fill a PDF).
You want the model to reach for the right one on its own, on whatever provider
you happen to run, without pasting every skill into the system prompt.

`withSkills` from `@tanstack/ai-skills` does this. It renders a short catalog of
the skills you offer, and gives the model a `load_skill` tool. The model reads
the catalog, picks a skill, calls `load_skill`, and gets the full instructions
back, only when it needs them. This works with any tool-calling model.

> This is the **portable** path: it runs on the model you already use, no server
> sandbox required. For hosted skills that run in a provider's sandbox, see
> [Provider Skills](../tools/provider-skills). The two do not mix in one call,
> see [Portable vs hosted](../tools/provider-skills#portable-vs-hosted-skills).

## Install

```bash
npm install @tanstack/ai-skills
```

## Add skills to a chat

Define a skill inline, then pass it to `withSkills` in the `middleware` array.
The middleware handles the catalog and the `load_skill` tool for you.

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
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
  const { messages } = await request.json()

  const stream = chat({
    adapter: anthropicText('claude-sonnet-4-5'),
    messages,
    middleware: [withSkills(pptx)],
  })

  return toServerSentEventsResponse(stream)
}
```

That is the whole setup. The model now sees `pptx-builder` in its catalog and
can call `load_skill` to pull in the instructions when a deck-building task comes
up.

## What the model sees

`withSkills` adds two things to the request:

- A catalog in the system prompt, one line per skill (name plus description).
  The `name` of `load_skill` is constrained to your skill names, so the model
  cannot invent one.
- A `load_skill` tool. When the model calls it, the middleware returns the
  skill body (frontmatter stripped) plus a list of any bundled resources.

Loading the same skill twice in one conversation returns a short "already
loaded" marker instead of repeating the body, so context stays lean.

## Offer more than one skill

Pass an array. Skills are sorted by name and deduped for you.

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
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
  const { messages } = await request.json()

  const stream = chat({
    adapter: anthropicText('claude-sonnet-4-5'),
    messages,
    middleware: [withSkills([pptx, brand])],
  })

  return toServerSentEventsResponse(stream)
}
```

Inline skills are the quickest start, but you rarely keep skills in code. Read
them from a folder, a build-time bundle, or your own database. See
[Skill sources](./skill-sources).

## Tune the catalog

`withSkills` takes options for the common cases:

```ts ignore
withSkills(sources, {
  // Cap the catalog so a big skill library doesn't tax every request.
  // Default 4000 tokens; throws if exceeded unless you supply a reducer.
  maxCatalogTokens: 4000,

  // Require a human approval before load_skill runs. Default false.
  requireApproval: true,
})
```

The catalog is rendered per model family: Anthropic models get the
`<available_skills>` XML they are tuned for, everything else gets a plain
markdown list. You can override this with a `renderCatalog` function or an
`instructionTemplate` string that has a `{skills}` placeholder.

## Read a skill's files

Some skills bundle reference files (a style guide, a schema, an example). To let
the model read them, add `createResourceTool` to your `tools`. `withSkills`
notices it and tells the model it can call `read_skill_resource`.

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { createResourceTool, inlineSkill, withSkills } from '@tanstack/ai-skills'

const pdf = inlineSkill({
  name: 'pdf-filler',
  description: 'Fill a PDF form from a data object.',
  instructions: '# Fill a PDF\nSee references/fields.md for the field map.',
  resources: { 'references/fields.md': 'name -> field_1\nemail -> field_2' },
})

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: anthropicText('claude-sonnet-4-5'),
    messages,
    tools: [createResourceTool(pdf)],
    middleware: [withSkills(pdf)],
  })

  return toServerSentEventsResponse(stream)
}
```

Without the resource tool, resources are still listed in the `load_skill`
result, but the model is told they are not loadable in this setup.

## Where to go next

- [Skill sources](./skill-sources) — load skills from a folder, a build-time
  bundle, or your own store, and combine several sources.
- [Write a skill source](./writing-adapters) — back skills with S3, a database,
  or a registry, and prove it with the conformance suite.
- [Provider Skills](../tools/provider-skills) — hosted skills that run in a
  provider sandbox, and when to use them instead.
