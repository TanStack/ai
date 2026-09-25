---
title: Skill Sources
id: skill-sources
order: 2
description: "Load portable Agent Skills from a folder, a build-time bundle, or your own store, and combine several sources with aggregate, dedupe, filter, and cache."
keywords:
  - tanstack ai
  - skill sources
  - skillDirectory
  - staticSkills
  - inlineSkill
  - skill catalog
  - edge skills
---

Inline skills are fine for a demo, but real skills live somewhere: a folder in
your repo, a bundle baked at build time, or rows in a database. A `SkillSource`
is how `withSkills` reads them. This page covers the three built-in sources and
how to combine them.

Every source is bytes only, so the same middleware works on the edge, in a
Worker, or on a server. Pick the source that matches where your skills live.

## From a folder

`skillDirectory` walks a folder for `SKILL.md` files. It lives under the `/node`
entry point because it reads the filesystem, so use it on a server, not the edge.

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { withSkills } from '@tanstack/ai-skills'
import { skillDirectory } from '@tanstack/ai-skills/node'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: anthropicText('claude-sonnet-4-5'),
    messages,
    middleware: [withSkills(skillDirectory('./skills'))],
  })

  return toServerSentEventsResponse(stream)
}
```

A skill folder is any directory that contains a `SKILL.md`. Bundled files under
`references/` and `assets/` become the skill's resources, and files under
`scripts/` are listed too (they are inventoried, not run, in this release).

By default `skillDirectory` is strict: a malformed `SKILL.md` is an error, so a
broken file never slips into your catalog silently. Pass `{ strict: false }` to
skip bad files and load the rest.

## From a build-time bundle (edge-safe)

For an edge deployment you cannot read the filesystem at request time. The Vite
plugin globs your skills at build time and bakes them into the bundle, so
`staticSkills` needs no filesystem at runtime.

Add the plugin to your Vite config:

```ts ignore
import { defineConfig } from 'vite'
import { skillsCatalogPlugin } from '@tanstack/ai-skills/node'

export default defineConfig({
  plugins: [skillsCatalogPlugin({ dir: 'skills' })],
})
```

Then wrap the generated catalog:

```ts ignore
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { withSkills } from '@tanstack/ai-skills'
import { staticSkills } from '@tanstack/ai-skills/static'
import { catalog } from 'virtual:tanstack-skills'

const skills = staticSkills(catalog)

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: anthropicText('claude-sonnet-4-5'),
    messages,
    middleware: [withSkills(skills)],
  })

  return toServerSentEventsResponse(stream)
}
```

Because the catalog is baked at build time, `skills.names` is a typed list of
your skill names, and the `load_skill` tool's `name` is constrained to it.

## From your own store

For DB, S3, or registry-backed skills, define a `SkillSource` yourself. It is a
small interface: list the skills, and load one by name. See
[Write a skill source](./writing-adapters) for the full walkthrough and the
conformance suite that proves your adapter behaves.

## Combine sources

Real setups layer skills: org-wide, per-project, per-tenant. Combine them with
the combinators, then pass the result to `withSkills`.

```ts ignore
import { aggregate, dedupe } from '@tanstack/ai-skills'

// Org skills plus this tenant's skills, org first on a name clash.
const source = dedupe(aggregate([orgSkills, tenantSkills]))
```

| Combinator | What it does |
|---|---|
| `aggregate([a, b])` | Concatenate sources in order. No dedupe. |
| `dedupe(source)` | First occurrence of a name wins, warns on a clash. |
| `filter(source, fn)` | Hide skills your predicate rejects. Hidden skills never reach the catalog. |
| `cache(source)` | Memoize `list()` and `load()`. Shares one fetch across concurrent calls. |

Passing an array straight to `withSkills([a, b])` is shorthand for
`dedupe(aggregate([a, b]))`. A single source is used as-is and never wrapped, so
a tenant-scoped source is never cached into a shared bucket by accident. Reach
for `cache` yourself only when the source is safe to share.

## Where to go next

- [Portable Agent Skills](./agent-skills) — the middleware, the catalog, and the
  `load_skill` flow.
- [Write a skill source](./writing-adapters) — back skills with your own store.
