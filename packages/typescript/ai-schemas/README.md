# @tanstack/ai-schemas

Runtime schemas for AI provider endpoints. Ships **JSON Schema** definitions for tooling plus **Zod** schemas for runtime validation — no hand-maintained TypeScript types. Derive types from Zod with `z.infer<typeof someSchema>`.

Schemas are generated nightly from each provider's official OpenAPI spec (or equivalent), so the package tracks upstream changes automatically.

## Install

```bash
pnpm add @tanstack/ai-schemas
# Zod is an optional peer; only required if you import from `@tanstack/ai-schemas/{provider}/zod`.
pnpm add zod
```

## Providers covered

| Provider   | Source                                                                      | Notes                                                  |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| OpenAI     | `github.com/openai/openai-openapi` (raw `openapi.yaml`)                     | Public, no API key required.                           |
| Anthropic  | Official OpenAPI from `anthropic-sdk-typescript` repo                       | Public.                                                |
| Gemini     | `generativelanguage.googleapis.com/$discovery/rest?version=v1beta`          | Google Discovery doc converted to OpenAPI in-pipeline. |
| ElevenLabs | `api.elevenlabs.io/openapi.json`                                            | Public.                                                |
| FAL        | `api.fal.ai/v1/models?status=active&expand=openapi-3.0` (per-model OpenAPI) | Needs `FAL_KEY` to fetch. Per-category split.          |

OpenAI-compatible providers (Groq, xAI/Grok) reuse the OpenAI schemas.

## Entry points

ES modules only. Provider-first subpaths — pick the provider, then the format:

```ts
// Per-provider JSON Schemas (no `zod` peer required).
import { openaiEndpointSchemaMap } from '@tanstack/ai-schemas/openai/json-schema'

// Per-provider Zod (requires `zod ^4`).
import { openaiEndpointZodMap } from '@tanstack/ai-schemas/openai/zod'

// OpenAI structured-outputs strict-mode helper.
import { toOpenAIStrict } from '@tanstack/ai-schemas/openai-strict'
```

For multi-category providers (currently just FAL), the category is part of the subpath:

```ts
import { videoEndpointZodMap } from '@tanstack/ai-schemas/fal-video/zod'
import { imageEndpointSchemaMap } from '@tanstack/ai-schemas/fal-image/json-schema'
```

There is **no aggregator barrel** — provider-first imports mean bundlers tree-shake by file. Importing `@tanstack/ai-schemas/gemini/json-schema` ships only Gemini's JSON Schemas; no other provider's bytes end up in your app.

## Examples

Validate a video generation request before hitting the network:

```ts
import { videoEndpointZodMap } from '@tanstack/ai-schemas/fal-video/zod'

const result = videoEndpointZodMap[
  'fal-ai/kling-video/o3/pro/text-to-video'
].input.safeParse({
  prompt: 'A mecha lands on the ground to save the city, in anime style',
  duration: '8',
  aspect_ratio: '9:16',
})

if (!result.success) console.error(result.error.issues)
```

Discover what a model supports (build a duration picker):

```ts
import { KlingVideoO3ProTextToVideoInputSchema } from '@tanstack/ai-schemas/fal-video/json-schema'

KlingVideoO3ProTextToVideoInputSchema.properties.duration.enum
// ['3', '4', …, '15']
```

## Bundle size and tree-shaking

The package is `sideEffects: false` and JSON Schemas ship self-contained — each schema bundles its `$ref` closure under `$defs`. Importing one schema pulls only that schema's transitive closure, not the whole category. The provider-first subpaths mean a `import … from '@tanstack/ai-schemas/openai/json-schema'` carries no Anthropic, Gemini, ElevenLabs, or FAL bytes.

## How updates work

The `.github/workflows/sync-schemas.yml` workflow runs nightly:

1. `fetch-schemas` — pulls upstream OpenAPI specs (or equivalents) per provider.
2. `generate-schemas` — runs `@hey-api/openapi-ts` to emit per-provider `schemas.gen.ts` (JSON Schemas) and `zod.gen.ts` (Zod).
3. `generate-endpoint-maps` — emits endpoint-id-keyed maps and bundles `$defs` closures into each JSON Schema.

If any provider's spec changes, the workflow bumps the package version, creates a changeset, and opens an automated PR.

## Local development

```bash
# Pull every provider's spec.
pnpm fetch-schemas

# Pull a single provider.
pnpm fetch-schemas --provider=openai

# Full regeneration.
pnpm update-schemas
```

`FAL_KEY` must be set in your environment to fetch FAL specs.
