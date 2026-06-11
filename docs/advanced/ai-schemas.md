---
title: '@tanstack/ai-schemas: provider endpoint schemas'
id: ai-schemas
---

`@tanstack/ai-schemas` is a separate package that ships **JSON Schema** and **Zod** schemas for the generation endpoints of every supported provider (OpenAI, Anthropic, Gemini, ElevenLabs, xAI Grok, OpenRouter, FAL). The schemas are generated nightly from each provider's official OpenAPI spec, so they track upstream changes automatically.

It complements the `model-meta.ts` shipped with each provider adapter: where `model-meta` describes coarse facts (context window, modalities, pricing), `ai-schemas` describes the rich per-endpoint constraint surface — allowed video durations, image sizes, voice IDs, prompt-length caps, etc.

## When to reach for it

- **Runtime validation before submitting a request** — surface bad inputs client-side instead of paying a round-trip and waiting on a vague upstream error.
- **Discovering allowed values** — populate dropdowns or pick lists with the exact enum a model accepts.
- **Feeding an LLM tool API** — each JSON Schema is self-contained (its `$ref` closure is bundled under `$defs`), so it can be passed straight to OpenAI / Anthropic / Gemini tool-use APIs without extra resolution.
- **Optimising prompts across models** — the schemas expose every model's constraints in a comparable shape, which is the foundation for prompt-portability helpers.

## Install

```bash
pnpm add @tanstack/ai-schemas
# Optional: only required if you import from `@tanstack/ai-schemas/{provider}/{activity}/zod`
pnpm add zod
```

## Activity groups

Each provider's endpoints are grouped by **activity**, matching the core library's activities (chat, generateImage, generateVideo, and the audio family — collapsed into a single `audio` group):

| Activity     | Covers                                                                  |
| ------------ | ----------------------------------------------------------------------- |
| `chat`       | Text generation: chat/completions, responses, messages, generateContent |
| `image`      | Image generation and edits                                              |
| `video`      | Video generation, edits, extensions                                     |
| `audio`      | All audio: TTS, transcription, music, sound effects, voices, dubbing    |
| `embeddings` | Embedding endpoints                                                     |
| `moderation` | Moderation endpoints                                                    |

Platform/admin endpoints (projects, invites, certificates, fine-tuning jobs, file stores, …) are excluded from generation entirely — they aren't generation constraint surface.

## Subpath imports

Provider-first — pick the provider, then the activity, then `json-schema` or `zod`:

```ts
// JSON Schemas (no `zod` peer required).
import { geminiChatEndpointSchemaMap } from '@tanstack/ai-schemas/gemini/chat/json-schema'

// Zod (requires `zod ^4`).
import { openaiChatEndpointZodMap } from '@tanstack/ai-schemas/openai/chat/zod'
import { elevenlabsAudioEndpointZodMap } from '@tanstack/ai-schemas/elevenlabs/audio/zod'
import { falVideoEndpointZodMap } from '@tanstack/ai-schemas/fal/video/zod'
```

There is **no aggregator barrel**. `import … from '@tanstack/ai-schemas/gemini/chat/json-schema'` only ships Gemini's chat JSON Schemas — no other provider's or activity's bytes leak into the consumer's bundle.

Endpoints that stream binary media (e.g. ElevenLabs text-to-speech) map only an `input` schema — there is no JSON output to describe.

## Validate a video-generation request

```ts
import { falVideoEndpointZodMap } from '@tanstack/ai-schemas/fal/video/zod'

const result = falVideoEndpointZodMap[
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
import { KlingVideoO3ProTextToVideoInputSchema } from '@tanstack/ai-schemas/fal/video/json-schema'

KlingVideoO3ProTextToVideoInputSchema.properties.duration.enum
// ['3', '4', …, '15']

KlingVideoO3ProTextToVideoInputSchema.properties.aspect_ratio.enum
// ['16:9', '9:16', '1:1']
```

## Per-model OpenRouter video constraints

OpenRouter exposes one generic `/videos` endpoint, but each video model accepts different durations, resolutions, aspect ratios, and sizes. The package synthesises one model-constrained schema per video model from OpenRouter's public `videos/models` metadata, keyed `videos/{model-id}` alongside the generic `videos` entry. Capabilities a model lacks (audio generation, deterministic seed, frame images) are absent from its schema entirely:

```ts
import { openrouterVideoEndpointZodMap } from '@tanstack/ai-schemas/openrouter/video/zod'

const result = openrouterVideoEndpointZodMap[
  'videos/x-ai/grok-imagine-video'
].input.safeParse({
  model: 'x-ai/grok-imagine-video',
  prompt: 'A mecha lands on the ground to save the city',
  duration: 8, // validated against the model's supported durations
  resolution: '720p', // validated against the model's supported resolutions
})

if (!result.success) console.error(result.error.issues)
```

## OpenAI structured-outputs strict mode

```ts
import { toOpenAIStrict } from '@tanstack/ai-schemas/openai-strict'
import { Veo3InputSchema } from '@tanstack/ai-schemas/fal/video/json-schema'

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
| xAI Grok   | `docs.x.ai/openapi.json`                                                        | Public.                                              |
| OpenRouter | `openrouter.ai/openapi.json` + `api/v1/videos/models` metadata                  | Public. Per-video-model schemas synthesised from the metadata. |
| FAL        | `api.fal.ai/v1/models?status=active&expand=openapi-3.0` (per-model)             | Needs `FAL_KEY`. Model categories regroup into the shared activities. |
