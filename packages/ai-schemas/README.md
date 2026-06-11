# @tanstack/ai-schemas

Runtime schemas for AI provider endpoints. Ships **JSON Schema** definitions for tooling plus **Zod** schemas for runtime validation — no hand-maintained TypeScript types. Derive types from Zod with `z.infer<typeof someSchema>`.

Schemas are generated nightly from each provider's official OpenAPI spec (or equivalent), so the package tracks upstream changes automatically.

## Install

```bash
pnpm add @tanstack/ai-schemas
# Zod is an optional peer; only required if you import from `@tanstack/ai-schemas/{provider}/{activity}/zod`.
pnpm add zod
```

## Providers covered

| Provider   | Source                                                                      | Notes                                                  |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| OpenAI     | `github.com/openai/openai-openapi` (raw `openapi.yaml`)                     | Public, no API key required.                           |
| Anthropic  | Official OpenAPI from `anthropic-sdk-typescript` repo                       | Public.                                                |
| Gemini     | `generativelanguage.googleapis.com/$discovery/rest?version=v1beta`          | Google Discovery doc converted to OpenAPI in-pipeline. |
| ElevenLabs | `api.elevenlabs.io/openapi.json`                                            | Public.                                                |
| xAI Grok   | `docs.x.ai/openapi.json`                                                    | Public.                                                |
| OpenRouter | `openrouter.ai/openapi.json` + `api/v1/videos/models` metadata              | Public.                                                |
| FAL        | `api.fal.ai/v1/models?status=active&expand=openapi-3.0` (per-model OpenAPI) | Needs `FAL_KEY` to fetch.                              |

Other OpenAI-compatible providers (e.g. Groq) reuse the OpenAI schemas.

## Activity groups

Each provider's endpoints are grouped by **activity**, matching the core library's activities (`@tanstack/ai`'s chat, generateImage, generateVideo, and the audio family):

| Activity     | Covers                                                                  |
| ------------ | ----------------------------------------------------------------------- |
| `chat`       | Text generation: chat/completions, responses, messages, generateContent |
| `image`      | Image generation and edits                                              |
| `video`      | Video generation, edits, extensions                                     |
| `audio`      | All audio: TTS, transcription, music, sound effects, voices, dubbing    |
| `embeddings` | Embedding endpoints                                                     |
| `moderation` | Moderation endpoints                                                    |

Not every provider has every group — `ls node_modules/@tanstack/ai-schemas/dist/esm/providers/<provider>` or your editor's import autocomplete shows what exists. Platform/admin endpoints (projects, invites, certificates, fine-tuning jobs, file stores, workspaces, …) are excluded from generation entirely: they aren't generation constraint surface, and dropping them keeps the shipped schemas lean.

## Entry points

ES modules only. Provider-first subpaths — pick the provider, then the activity, then the format:

```ts
// JSON Schemas (no `zod` peer required).
import { openaiChatEndpointSchemaMap } from '@tanstack/ai-schemas/openai/chat/json-schema'

// Zod (requires `zod ^4`).
import { openaiChatEndpointZodMap } from '@tanstack/ai-schemas/openai/chat/zod'
import { elevenlabsAudioEndpointZodMap } from '@tanstack/ai-schemas/elevenlabs/audio/zod'

// OpenAI structured-outputs strict-mode helper.
import { toOpenAIStrict } from '@tanstack/ai-schemas/openai-strict'
```

There is **no aggregator barrel** — provider-first, activity-grouped imports mean bundlers tree-shake by file. Importing `@tanstack/ai-schemas/openai/image/json-schema` ships only OpenAI's image schemas; no chat, no other providers, no platform noise.

## Examples

Validate a chat request before hitting the network:

```ts
import { openaiChatEndpointZodMap } from '@tanstack/ai-schemas/openai/chat/zod'

const result = openaiChatEndpointZodMap['chat/completions'].input.safeParse({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'hi' }],
})

if (!result.success) console.error(result.error.issues)
```

Validate a video generation request (FAL):

```ts
import { falVideoEndpointZodMap } from '@tanstack/ai-schemas/fal/video/zod'

const result = falVideoEndpointZodMap[
  'fal-ai/kling-video/o3/pro/text-to-video'
].input.safeParse({
  prompt: 'A mecha lands on the ground to save the city, in anime style',
  duration: '8',
  aspect_ratio: '9:16',
})
```

Discover what a model supports (build a duration picker):

```ts
import { KlingVideoO3ProTextToVideoInputSchema } from '@tanstack/ai-schemas/fal/video/json-schema'

KlingVideoO3ProTextToVideoInputSchema.properties.duration.enum
// ['3', '4', …, '15']
```

OpenRouter's video endpoint maps include one model-constrained entry per video model (synthesised from OpenRouter's public `videos/models` metadata) alongside the generic `videos` entry — durations, resolutions, aspect ratios, and sizes become per-model enums, and capabilities a model lacks (audio, seed, frame images) drop out of its schema:

```ts
import { openrouterVideoEndpointZodMap } from '@tanstack/ai-schemas/openrouter/video/zod'

openrouterVideoEndpointZodMap['videos/x-ai/grok-imagine-video'].input.safeParse(
  {
    model: 'x-ai/grok-imagine-video',
    prompt: 'A mecha lands on the ground to save the city',
    duration: 8, // validated against the model's supported durations
  },
)
```

Media generation endpoints that stream binary audio/video (e.g. ElevenLabs `v1/text-to-speech/{voice_id}`) map only an `input` schema — there is no JSON output to describe.

## Bundle size and tree-shaking

The package is `sideEffects: false` and JSON Schemas ship self-contained — each schema bundles its `$ref` closure under `$defs`. Importing one schema pulls only that schema's transitive closure, not the whole activity group. The provider-first subpaths mean an `import … from '@tanstack/ai-schemas/openai/chat/json-schema'` carries no other provider's or activity's bytes.

## How updates work

The `.github/workflows/sync-schemas.yml` workflow runs nightly:

1. `fetch-schemas` — pulls upstream OpenAPI specs (or equivalents) per provider.
2. `generate-schemas` — runs `@hey-api/openapi-ts` to emit per-(provider, activity) `schemas.gen.ts` (JSON Schemas) and `zod.gen.ts` (Zod).
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
