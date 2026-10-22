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

A skill source loads `SKILL.md` files from a folder, or from bytes you pass in when the server cannot read the disk.

A `SkillSource` tells `withSkills` where to read skills from. Pick the built-in source that matches where your skills live:

| Your skills live | Use | Runs on |
| --- | --- | --- |
| In a folder | `skillDirectory` from `@tanstack/ai-skills/node` | A Node server |
| In a folder, baked in at build time | `staticSkills` from `@tanstack/ai-skills/static` | The edge, Workers, and servers |
| In S3, a database, or a registry | Your own `SkillSource` | Where your store client runs |
| In your code | `inlineSkill` from `@tanstack/ai-skills` | Anywhere |

## Quick setup: load skills from a folder

### 1. Put each skill in its own folder

A skill folder is any folder that contains a `SKILL.md`:

```text
skills/
  pptx-builder/
    SKILL.md
    references/
      layouts.md
  brand-voice/
    SKILL.md
```

### 2. Pass `skillDirectory` to `withSkills`

`skillDirectory` reads the file system, so it lives under the `/node` entry point:

```ts
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { withSkills } from '@tanstack/ai-skills'
import { skillDirectory } from '@tanstack/ai-skills/node'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: anthropicText('claude-sonnet-5-5'),
    messages: params.messages,
    threadId: params.threadId,
    middleware: [withSkills(skillDirectory('./skills'))],
  })
  return toServerSentEventsResponse(stream)
}
```

The catalog now lists `pptx-builder` and `brand-voice`.

## How it works

A source gives `withSkills` bytes only. It lists the skills, and it loads one `SKILL.md` by name. It does not need a file path, so the same middleware runs on a server, in a Worker, or on the edge.

`skillDirectory` maps the folder like this:

- `SKILL.md` is the skill. Its frontmatter gives the name and the description.
- Files under `references/` and `assets/` become the skill's resources.
- Files under `scripts/` are listed in the `load_skill` result, but they do not run.

## Load skills at build time (edge-safe)

On the edge, you cannot read the file system at request time. The Vite plugin reads your skills at build time and puts them in the bundle. `staticSkills` then needs no file system.

1. Add the plugin to your Vite config:

```ts ignore
import { defineConfig } from 'vite'
import { skillsCatalogPlugin } from '@tanstack/ai-skills/node'

export default defineConfig({
  plugins: [skillsCatalogPlugin({ dir: 'skills' })],
})
```

2. Wrap the generated catalog with `staticSkills`:

```ts ignore
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { withSkills } from '@tanstack/ai-skills'
import { staticSkills } from '@tanstack/ai-skills/static'
import { catalog } from 'virtual:tanstack-skills'

const skills = staticSkills(catalog)

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: anthropicText('claude-sonnet-5-5'),
    messages: params.messages,
    threadId: params.threadId,
    middleware: [withSkills(skills)],
  })
  return toServerSentEventsResponse(stream)
}
```

The catalog is fixed at build time. So `skills.names` is a typed list of your skill names, and the `name` input of `load_skill` accepts only those names.

## Load skills from your own store

For skills in S3, a database, or a registry, write your own `SkillSource`. It has two required methods: list the skills, and load one by name. See [Write a skill source](./writing-adapters).

## Combine sources

Real apps often layer skills: one set for the whole org, one per project, one per tenant. Combine the sources, then pass the result to `withSkills`:

```ts ignore
import { aggregate, dedupe } from '@tanstack/ai-skills'

// Org skills plus this tenant's skills. On a name clash, the org skill wins.
const source = dedupe(aggregate([orgSkills, tenantSkills]))
```

| Combinator | What it does |
|---|---|
| `aggregate([a, b])` | Joins the sources in order. It does not remove duplicates. |
| `dedupe(source)` | The first skill with a name wins. It logs a warning on a clash. |
| `filter(source, fn)` | Hides each skill that `fn` rejects. Hidden skills never reach the catalog. |
| `cache(source)` | Keeps the results of `list()` and `load()` in memory. Calls at the same time share one fetch. |

`withSkills([a, b])` with an array is a short form of `dedupe(aggregate([a, b]))`.

## Advanced

### Broken `SKILL.md` files

`skillDirectory` skips a `SKILL.md` that it cannot use. Other skills still load.

- A file with no frontmatter, or with no `description`, is always skipped.
- A file with a warning is skipped in the default strict mode. The warnings are: the name does not match the folder name, the name is longer than 64 characters, or the name has invalid characters.

To load files that have warnings, pass `{ strict: false }`:

```ts ignore
skillDirectory('./skills', { strict: false })
```

`skillDirectory` also accepts an array of folders and a `maxDepth` option. With several folders, the first skill with a name wins.

### When to cache

`withSkills` uses a single source as it is. It never wraps it in `cache`. So a source for one tenant never goes into a shared cache by accident.

If all users can safely share the source, add `cache` yourself. To expire the cache, pass a time in milliseconds:

```ts ignore
import { cache } from '@tanstack/ai-skills'

const shared = cache(orgSkills, { refreshInterval: 60_000 })
```

### Combinator options

- `dedupe(source, onCollision)`: replace the default warning with your own function `(name) => void`.
- `filter(source, predicate, ctx)`: the predicate gets `(skill, ctx)`. Pass request data, such as a tenant id, in `ctx`.
