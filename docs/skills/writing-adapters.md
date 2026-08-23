---
title: Write a Skill Source
id: writing-skill-sources
order: 3
description: "Back portable Agent Skills with your own store (S3, a database, a registry) by implementing SkillSource, and prove it with the shipped conformance suite."
keywords:
  - tanstack ai
  - SkillSource
  - custom skill source
  - conformance
  - runSkillSourceConformance
  - s3 skills
  - database skills
---

Your skills live in S3, a database, or a private registry, not on disk. To feed
them to `withSkills`, implement a `SkillSource`. It is a small, bytes-only
interface, so it works anywhere, including the edge.

This page shows the minimum source, then how to prove it is correct with the
conformance suite that ships in the package.

## The minimum source

A source needs two methods: `list` returns the catalog, `load` returns one
skill's `SKILL.md` body. Here is an S3-backed one.

```ts ignore
import type { SkillSource } from '@tanstack/ai-skills'

export function s3Skills(bucket: S3Bucket): SkillSource {
  return {
    async list() {
      const index = await bucket.getJSON('skills/index.json')
      return index.map((s) => ({ name: s.name, description: s.description }))
    },
    async load(name) {
      return bucket.getText(`skills/${name}/SKILL.md`)
    },
  }
}
```

Pass it straight to `withSkills(s3Skills(bucket))`. The middleware strips the
frontmatter from what `load` returns, so return the raw `SKILL.md`.

## Add resources and a revision

Two optional methods make the source better:

- `revision()` returns a stable string that changes only when content changes.
  `withSkills` uses it to cache the catalog and keep prompt caching stable, so
  add it whenever you can compute one cheaply (a bucket ETag, a content hash).
- `listResources` and `readResource` expose a skill's bundled files so
  `read_skill_resource` can read them.

```ts ignore
import type { SkillSource } from '@tanstack/ai-skills'

export function s3Skills(bucket: S3Bucket): SkillSource {
  return {
    revision: () => bucket.getText('skills/index.etag'),
    async list() {
      /* as above */
    },
    async load(name) {
      return bucket.getText(`skills/${name}/SKILL.md`)
    },
    async listResources(name) {
      return bucket.listKeys(`skills/${name}/references/`)
    },
    async readResource(name, path) {
      return bucket.getBytes(`skills/${name}/${path}`)
    },
  }
}
```

The source is bytes only on purpose. There is no `path` field, so a database or
registry source is a first-class citizen, not a second-class one bolted onto a
filesystem assumption.

## Prove it with the conformance suite

Adapter code is easy to get subtly wrong (a missing skill that returns empty
instead of throwing, a resource path that escapes the skill root). The package
ships a conformance suite so you test behavior, not guesswork.

Seed your source with the fixture the suite expects (a skill `alpha` with a
`references/note.md` resource whose contents are `hello`, and a skill `beta`),
then run it:

```ts ignore
import { runSkillSourceConformance } from '@tanstack/ai-skills/testing'
import { s3Skills } from './s3-skills'

runSkillSourceConformance(() => s3Skills(makeTestBucket()), 's3')
```

The suite checks the things that break in production:

- a missing skill name throws, it does not return empty
- resources load, and a path like `../../etc/passwd` is rejected
- `revision()` is stable across identical content
- concurrent `list()` calls stay consistent
- script bytes come back correctly (so your source keeps working when script
  execution lands in a later release)

If it passes, your source is safe to hand to `withSkills`.

## Where to go next

- [Skill sources](./skill-sources) — the built-in sources and the combinators.
- [Portable Agent Skills](./agent-skills) — the middleware and the `load_skill`
  flow your source feeds.
