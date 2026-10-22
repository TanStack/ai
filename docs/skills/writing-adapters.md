---
title: Write a Skill Source
id: writing-skill-sources
order: 3
description: "Back portable Agent Skills with your own store (S3, a database, a registry) by implementing SkillSource, and prove it with the conformance suite that ships in the package."
keywords:
  - tanstack ai
  - SkillSource
  - custom skill source
  - conformance
  - runSkillSourceConformance
  - s3 skills
  - database skills
---

A skill source adapter loads skills from S3, a database, or a registry. `withSkills` then reads them through that adapter.

Write a `SkillSource` for your store. It is a small interface that returns bytes only, so it works anywhere, including the edge. Then prove it with the conformance suite.

## Quick setup

### 1. Write the source

A source needs two methods:

- `list` returns the catalog: a name and a description for each skill.
- `load` returns the raw `SKILL.md` of one skill, frontmatter included. It throws when the name does not exist.

This source reads from any store that you wrap in a `SkillStore`:

```ts
// db-skills.ts
import type { SkillSource } from '@tanstack/ai-skills'

export interface SkillRow {
  name: string
  description: string
  /** The raw SKILL.md, frontmatter included. */
  body: string
}

export interface SkillStore {
  listSkills: () => Promise<Array<SkillRow>>
  getSkill: (name: string) => Promise<SkillRow | undefined>
}

export function dbSkills(store: SkillStore): SkillSource {
  return {
    async list() {
      const rows = await store.listSkills()
      return rows.map((row) => ({
        name: row.name,
        description: row.description,
      }))
    },
    async load(name) {
      const row = await store.getSkill(name)
      if (!row) {
        throw new Error(`no skill named "${name}"`)
      }
      return row.body
    },
  }
}
```

### 2. Pass it to `withSkills`

```ts ignore
import { withSkills } from '@tanstack/ai-skills'
import { dbSkills } from './db-skills'

const skills = withSkills(dbSkills(yourStore))
```

Add `skills` to the `middleware` array of `chat()`, as in [Portable Agent Skills](./agent-skills). The middleware removes the frontmatter from what `load` returns.

### 3. Run the conformance suite

The package ships a Vitest suite at `@tanstack/ai-skills/testing`. Seed your source with the fixture that the suite expects:

- A skill `alpha` with a description.
- A skill `beta` with a description.

```ts
// db-skills.test.ts
import { runSkillSourceConformance } from '@tanstack/ai-skills/testing'
import { dbSkills } from './db-skills'
import type { SkillRow } from './db-skills'

function makeTestStore() {
  const rows: Array<SkillRow> = [
    {
      name: 'alpha',
      description: 'First test skill.',
      body: '---\nname: alpha\ndescription: First test skill.\n---\n# Alpha',
    },
    {
      name: 'beta',
      description: 'Second test skill.',
      body: '---\nname: beta\ndescription: Second test skill.\n---\n# Beta',
    },
  ]
  return {
    listSkills: async () => rows,
    getSkill: async (name: string) => rows.find((row) => row.name === name),
  }
}

runSkillSourceConformance(() => dbSkills(makeTestStore()), 'db')
```

Run your tests. When the suite passes, your source is safe to give to `withSkills`.

## How it works

`withSkills` calls `list()` once for each `chat()` call to build the catalog. When the model calls `load_skill`, the middleware calls `load(name)`.

A source has no `path` field. It returns bytes, so a database or a registry works the same as a folder.

The suite tests these rules:

- A missing skill name throws. It does not return an empty string.
- Two `list()` calls at the same time return the same skills.
- `revision()`, if present, returns the same value for the same content.
- Resources load, and a path like `../../etc/passwd` is rejected.
- Script bytes come back unchanged.

The suite skips the resource and script checks when your source does not have those methods.

## Advanced

### Optional methods

| Method | Returns | Use it for |
| --- | --- | --- |
| `revision()` | `Promise<string>` | A stable value that changes only when the content changes, such as a bucket ETag or a content hash. |
| `listResources(name)` | `Promise<Array<string>>` | Paths under `references/` and `assets/`, relative to the skill root. |
| `readResource(name, path)` | `Promise<string \| Uint8Array>` | The content of one resource. `read_skill_resource` calls it. |
| `listScripts(name)` | `Promise<Array<SkillScriptRef>>` | The scripts of a skill, listed but not run. |
| `readScript(name, path)` | `Promise<Uint8Array>` | The bytes of one script. |

`withSkills` does not cache on `revision()`. Add `revision()` so that combinators, your own cache, or a catalog memo can use it as a key.

### Add resources and a revision

This example reads from an S3-style bucket. Call `assertSafeResourcePath` before you read a path, so a path outside the skill root throws:

```ts ignore
import { assertSafeResourcePath } from '@tanstack/ai-skills'
import type { SkillSource } from '@tanstack/ai-skills'

export function s3Skills(bucket: S3Bucket): SkillSource {
  return {
    revision: () => bucket.getText('skills/index.etag'),
    async list() {
      const index = await bucket.getJSON('skills/index.json')
      return index.map((s) => ({ name: s.name, description: s.description }))
    },
    async load(name) {
      return bucket.getText(`skills/${name}/SKILL.md`)
    },
    async listResources(name) {
      return bucket.listKeys(`skills/${name}/references/`)
    },
    async readResource(name, path) {
      assertSafeResourcePath(path)
      return bucket.getBytes(`skills/${name}/${path}`)
    },
  }
}
```

### Full fixture for resources and scripts

If your source has resource methods, the suite also expects this on `alpha`:

- A resource `references/note.md` with the content `hello`.

If your source has script methods, the suite also expects this on `alpha`:

- A script `scripts/run.py` whose bytes decode to `print(1)`, listed with `executable: false`.
