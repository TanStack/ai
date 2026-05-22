---
title: '@tanstack/ai-schemas: provider endpoint schemas'
id: ai-schemas
---

`@tanstack/ai-schemas` is a separate package that ships **JSON Schema** and **Zod** schemas for every endpoint of every supported provider (OpenAI, Anthropic, Gemini, ElevenLabs, FAL). The schemas are generated nightly from each provider's official OpenAPI spec, so they track upstream changes automatically.

It complements the `model-meta.ts` shipped with each provider adapter: where `model-meta` describes coarse facts (context window, modalities, pricing), `ai-schemas` describes the rich per-endpoint constraint surface — allowed video durations, image sizes, voice IDs, prompt-length caps, etc.

## When to reach for it

- **Runtime validation before submitting a request** — surface bad inputs client-side instead of paying a round-trip and waiting on a vague upstream error.
- **Discovering allowed values** — populate dropdowns or pick lists with the exact enum a model accepts.
- **Feeding an LLM tool API** — each JSON Schema is self-contained (its `$ref` closure is bundled under `$defs`), so it can be passed straight to OpenAI / Anthropic / Gemini tool-use APIs without extra resolution.
- **Optimising prompts across models** — the schemas expose every model's constraints in a comparable shape, which is the foundation for prompt-portability helpers.

## Install

```bash
pnpm add @tanstack/ai-schemas
# Optional: only required if you import from `@tanstack/ai-schemas/{provider}/zod`
pnpm add zod
```

## Subpath imports

Provider-first — pick the provider, then `json-schema` or `zod`:

```ts
// JSON Schemas (no `zod` peer required).
import { geminiEndpointSchemaMap } from '@tanstack/ai-schemas/gemini/json-schema'

// Zod (requires `zod ^4`).
import { openaiEndpointZodMap } from '@tanstack/ai-schemas/openai/zod'

// FAL splits by category — the category is part of the subpath.
import { videoEndpointZodMap } from '@tanstack/ai-schemas/fal-video/zod'
import { imageEndpointSchemaMap } from '@tanstack/ai-schemas/fal-image/json-schema'
```

There is **no aggregator barrel**. `import … from '@tanstack/ai-schemas/gemini/json-schema'` only ships Gemini's JSON Schemas — no other provider's bytes leak into the consumer's bundle.

## Validate a video-generation request

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

## Discover what a model supports

```ts
import { KlingVideoO3ProTextToVideoInputSchema } from '@tanstack/ai-schemas/fal-video/json-schema'

KlingVideoO3ProTextToVideoInputSchema.properties.duration.enum
// ['3', '4', …, '15']

KlingVideoO3ProTextToVideoInputSchema.properties.aspect_ratio.enum
// ['16:9', '9:16', '1:1']
```

## OpenAI structured-outputs strict mode

```ts
import { toOpenAIStrict } from '@tanstack/ai-schemas/openai-strict'
import { Veo3InputSchema } from '@tanstack/ai-schemas/fal-video/json-schema'

await openai.chat.completions.create({
  model: 'gpt-5',
  messages: [...],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'veo3_input',
      schema: toOpenAIStrict(Veo3InputSchema),
      strict: true,
    },
  },
})
```

## How it stays current

The `.github/workflows/sync-schemas.yml` workflow runs daily and:

1. Fetches upstream OpenAPI specs for every provider.
2. Re-runs `@hey-api/openapi-ts` to regenerate JSON Schemas + Zod.
3. Bundles each schema's `$ref` closure, regenerates endpoint maps.
4. If anything changed: bumps the package patch version, writes a changeset, opens an automated PR.

Provider sources:

| Provider   | Source                                                                          | Notes                                                |
| ---------- | ------------------------------------------------------------------------------- | ---------------------------------------------------- |
| OpenAI     | `github.com/openai/openai-openapi`                                              | Public, no API key required.                         |
| Anthropic  | Stainless-generated OpenAPI (resolved via `anthropic-sdk-typescript/.stats.yml`) | Public.                                              |
| Gemini     | `generativelanguage.googleapis.com/$discovery/rest?version=v1beta`              | Google Discovery doc converted to OpenAPI in pipeline. |
| ElevenLabs | `api.elevenlabs.io/openapi.json`                                                | Public.                                              |
| FAL        | `api.fal.ai/v1/models?status=active&expand=openapi-3.0` (per-model)             | Needs `FAL_KEY`. Per-category split (`fal-image`, `fal-video`, etc.). |
