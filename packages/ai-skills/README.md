<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-skills

Portable Agent Skills (SKILL.md) as a first-class `chat()` middleware for TanStack AI

`withSkills` renders a short catalog of the skills you offer into the system prompt and gives the model a `load_skill` tool. The model reads the catalog, picks a skill, and pulls the full instructions only when it needs them — so a large skill library does not tax every request. This is the _portable_ path: it runs on any tool-calling model, with no provider sandbox. For skills that run in a provider's own sandbox, see [Provider Skills](https://tanstack.com/ai/latest/docs/tools/provider-skills); the two do not mix in one call.

## Installation

```bash
npm install @tanstack/ai-skills
# or
pnpm add @tanstack/ai-skills
# or
yarn add @tanstack/ai-skills
```

## Usage

Define a skill and pass it to `withSkills` in the `middleware` array. The middleware handles the catalog and the `load_skill` tool for you.

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { inlineSkill, withSkills } from '@tanstack/ai-skills'

const pptx = inlineSkill({
  name: 'pptx-builder',
  description: 'Build and edit PowerPoint decks with python-pptx.',
  instructions: '# Building a deck\nUse python-pptx. Edit slides, then save.',
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

Pass an array to offer several; they are sorted by name and deduped. Loading the same skill twice in one conversation returns a short "already loaded" marker instead of repeating the body.

### Tuning the catalog

```typescript
withSkills(sources, {
  // Cap the catalog so a big library doesn't tax every request.
  // Default 4000 tokens; throws if exceeded unless you supply a reducer.
  maxCatalogTokens: 4000,
  // Require a human approval before load_skill runs. Default false.
  requireApproval: true,
})
```

The catalog is rendered per model family — Anthropic models get the `<available_skills>` XML they are tuned for, everything else a plain markdown list — and you can override that with `renderCatalog` or an `instructionTemplate`.

## Where skills come from

Inline skills are the quickest start, but skills usually live somewhere else. Each source is on its own entry point:

| Source                  | Import                       | Use when                                                                                                                    |
| ----------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `inlineSkill(...)`      | `@tanstack/ai-skills`        | Defining a skill in code                                                                                                    |
| `skillDirectory(...)`   | `@tanstack/ai-skills/node`   | Walking a folder of `SKILL.md` files — reads the filesystem, so server only                                                 |
| `staticSkills(catalog)` | `@tanstack/ai-skills/static` | A build-time bundle, no filesystem at runtime (edge-safe). Pair with `skillsCatalogPlugin` from `/node` in your Vite config |
| Your own `SkillSource`  | —                            | Skills in S3, a database, a registry                                                                                        |

`aggregate`, `dedupe`, `filter`, `cache`, and `combineSources` compose these.

### Writing your own source

Implement the `SkillSource` contract, then prove it with the conformance suite the package ships:

```typescript
import { runSkillSourceConformance } from '@tanstack/ai-skills/testing'
import { s3Skills } from './s3-skills'

runSkillSourceConformance(() => s3Skills(makeTestBucket()), 's3')
```

It checks the things that break in production: a missing skill throws rather than returning empty, resources load while a path like `../../etc/passwd` is rejected, `revision()` is stable across identical content, and concurrent `list()` calls stay consistent. The optional parts of the contract are only checked when you implement them — the resource cases need both `listResources` and `readResource`, and the revision case needs `revision` — so a source that cannot represent them is skipped rather than failed. `vitest` is an optional peer dependency for this entry point.

## Documentation

- [Portable Agent Skills](https://tanstack.com/ai/latest/docs/skills/agent-skills): what the model sees, catalog options, reading a skill's bundled files
- [Skill sources](https://tanstack.com/ai/latest/docs/skills/skill-sources): folder, build-time bundle, your own store, and combining them
- [Writing a skill source](https://tanstack.com/ai/latest/docs/skills/writing-adapters): the `SkillSource` contract and the conformance suite

## License

MIT
