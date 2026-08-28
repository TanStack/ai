---
name: ai-skills
description: >
  Portable Agent Skills (SKILL.md) for TanStack AI with @tanstack/ai-skills.
  Renders a skill catalog and a load_skill tool via the withSkills middleware so
  any tool-calling model loads skills on demand, on any provider. Covers the
  SkillSource interface, inlineSkill/skillDirectory/staticSkills, the aggregate/
  dedupe/filter/cache combinators, read_skill_resource, and the conformance
  suite. Use for provider-agnostic runtime skills — NOT hosted provider skills
  (codeExecutionTool/shellTool), which run in a provider sandbox.
type: core
library: tanstack-ai
library_version: '0.0.0'
sources:
  - 'TanStack/ai:docs/skills/agent-skills.md'
  - 'TanStack/ai:docs/skills/skill-sources.md'
  - 'TanStack/ai:docs/skills/writing-adapters.md'
  - 'TanStack/ai:docs/tools/provider-skills.md'
---

# TanStack AI Skills

> Builds on the `ai-core` skill in `@tanstack/ai`. Package: `@tanstack/ai-skills`.

Portable Agent Skills give a tool-calling model a library of `SKILL.md` skills it
can load on demand, on any provider, with no server sandbox. This is separate
from hosted **Provider Skills** (`codeExecutionTool` / `shellTool`), which run in
the provider's sandbox and are referenced by ID.

## Two skill features, do not confuse them

| Need                                            | Use                                   |
| ----------------------------------------------- | ------------------------------------- |
| Model loads SKILL.md at runtime, any provider   | `withSkills` (this package)           |
| Hosted skill runs in a provider sandbox by ID   | `codeExecutionTool` / `shellTool`     |
| Teach a coding assistant how to use TanStack AI | Ship a `SKILL.md`, install via Intent |

The portable and hosted paths do not mix in one `chat()` call: `withSkills`
throws if a `code_execution`/`shell` tool in the same call carries skills.

## Add skills to a chat

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { inlineSkill, withSkills } from '@tanstack/ai-skills'

const pptx = inlineSkill({
  name: 'pptx-builder',
  description: 'Build and edit PowerPoint decks with python-pptx.',
  instructions: '# Building a deck\nUse python-pptx. Edit slides, then save.',
})

const stream = chat({
  adapter: anthropicText('claude-sonnet-4-5'),
  messages,
  middleware: [withSkills(pptx)],
})
```

`withSkills` adds a catalog to the system prompt and a `load_skill` tool whose
`name` is constrained to your skill names. It renders `<available_skills>` XML
for Anthropic models and markdown for the rest. Re-loading a skill in the same
conversation returns a short "already loaded" marker.

## Sources

A `SkillSource` is bytes only (no filesystem assumption), so the middleware runs
on the edge too.

- `inlineSkill({ name, description, instructions, resources? })` — one skill in
  code or a DB row. Edge-safe.
- `skillDirectory(root, { strict? })` — walk a folder for `SKILL.md`. Import from
  `@tanstack/ai-skills/node` (uses `node:fs`). Strict by default.
- `staticSkills(catalog)` — build-time bundle via `skillsCatalogPlugin` (Vite).
  Edge-safe, and `.names` is a typed union.

Combine with `aggregate`, `dedupe`, `filter`, `cache`. `withSkills([a, b])` is
sugar for `dedupe(aggregate([a, b]))`. A single source is never auto-wrapped, so
a tenant-scoped source is never cached into a shared bucket.

## Resources

To let the model read a skill's bundled files, pass `createResourceTool(source)`
in `tools`. `withSkills` detects it and advertises `read_skill_resource`. Paths
that escape the skill root are rejected.

## Skills that carry code

`withSkills` inventories a skill's `scripts/` in the `load_skill` result but does
NOT run them (script execution is a later phase). To let a skill run code, pass
your own execution tool to `chat({ tools })` alongside `withSkills` and write the
skill so it tells the model to call that tool. `withSkills` composes with any
tools you provide.

```ts ignore
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const executeShell = toolDefinition({
  name: 'execute_shell',
  description: 'Run a shell command and return its stdout.',
  inputSchema: z.object({ command: z.string() }),
  outputSchema: z.object({ stdout: z.string() }),
}).server(async ({ command }) => ({ stdout: await runSomewhere(command) }))

// chat({ tools: [executeShell], middleware: [withSkills(source)] })
```

The skill supplies the command; your tool supplies the ability to run it. Swap in
a provider sandbox, a Code Mode isolate, or a remote worker without changing the
skill. For hosted skills that run in the provider's own sandbox, use
`codeExecutionTool` / `shellTool` instead (see provider-skills).

## Write a custom source

Implement `SkillSource` (`list` + `load`, optional `revision`/`listResources`/
`readResource`), then validate it with the shipped conformance suite:

```typescript
import { runSkillSourceConformance } from '@tanstack/ai-skills/testing'

runSkillSourceConformance(() => myS3Source(fixtures), 's3')
```

## Entry points

- `@tanstack/ai-skills` — types, `inlineSkill`, combinators, `withSkills`,
  `createResourceTool`, `validateSkill`, `staticSkills`, `SkillLimitError`.
- `@tanstack/ai-skills/node` — `skillDirectory`, `skillsCatalogPlugin` (`node:fs`).
- `@tanstack/ai-skills/testing` — `runSkillSourceConformance`.

## Docs

- Portable Agent Skills: `docs/skills/agent-skills.md`
- Skill sources: `docs/skills/skill-sources.md`
- Write a skill source: `docs/skills/writing-adapters.md`
- Provider (hosted) skills: `docs/tools/provider-skills.md`
