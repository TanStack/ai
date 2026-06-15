/**
 * OpenRouter provider — pulls the public OpenAPI 3.1 spec served at
 * openrouter.ai/openapi.json. No auth required for the spec itself.
 *
 * The static spec describes the request/response shape per endpoint
 * (including video generation's frame_images / input_references). Per-model
 * video constraints (supported_durations, resolutions, aspect ratios) live
 * in the separate GET /api/v1/videos/models metadata API (also public); the
 * fetcher caches that alongside the spec and the loader synthesises one
 * constrained VideoGenerationRequest variant per video model, exposed as
 * `videos/{model-id}` entries in the video endpoint maps.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  applyTransforms,
  mergeOpenAPISpecs,
  toActivitySpecs,
  type MergedSpec,
} from '../merge-openapi-specs.js'
import type {
  Activity,
  FetchOptions,
  ProviderCategorySpec,
  ProviderConfig,
} from '../providers.js'

const OPENROUTER_OPENAPI_URL = 'https://openrouter.ai/openapi.json'
const OPENROUTER_VIDEO_MODELS_URL = 'https://openrouter.ai/api/v1/videos/models'

async function fetchOpenRouter({ outDir }: FetchOptions): Promise<void> {
  mkdirSync(outDir, { recursive: true })

  console.log(`Fetching OpenRouter OpenAPI from ${OPENROUTER_OPENAPI_URL}...`)
  const response = await fetch(OPENROUTER_OPENAPI_URL)
  if (!response.ok) {
    throw new Error(
      `OpenRouter fetch failed: ${response.status} ${response.statusText}`,
    )
  }
  // The spec's key-management examples embed realistic-looking
  // `sk-or-v1-…` API keys that trip GitHub push protection when the spec is
  // committed. Redact them — they only appear in platform endpoints that
  // are dropped from generation anyway.
  const text = (await response.text()).replace(
    /sk-or-v1-[0-9a-f]{16,}/g,
    'sk-or-v1-REDACTED',
  )
  const spec = JSON.parse(text) as object
  writeFileSync(
    join(outDir, 'openrouter.openapi.json'),
    JSON.stringify(spec, null, 2),
  )
  console.log('  Wrote openrouter.openapi.json')

  console.log(
    `Fetching OpenRouter video models from ${OPENROUTER_VIDEO_MODELS_URL}...`,
  )
  const modelsResponse = await fetch(OPENROUTER_VIDEO_MODELS_URL)
  if (!modelsResponse.ok) {
    throw new Error(
      `OpenRouter video models fetch failed: ${modelsResponse.status} ${modelsResponse.statusText}`,
    )
  }
  const models = ((await modelsResponse.json()) as VideoModelsListResponse).data
  // Sort by id so the committed file diffs stably across nightly refreshes.
  models.sort((a, b) => a.id.localeCompare(b.id))
  writeFileSync(
    join(outDir, 'openrouter.video-models.json'),
    JSON.stringify({ data: models }, null, 2),
  )
  console.log('  Wrote openrouter.video-models.json')
}

/**
 * Shape of GET /api/v1/videos/models entries (the fields the synthesiser
 * consumes — the committed JSON keeps everything upstream returns).
 */
interface VideoModel {
  id: string
  name: string
  description?: string | null
  supported_resolutions?: Array<string> | null
  supported_aspect_ratios?: Array<string> | null
  supported_sizes?: Array<string> | null
  supported_durations?: Array<number> | null
  supported_frame_images?: Array<string> | null
  generate_audio?: boolean | null
  seed?: boolean | null
  allowed_passthrough_parameters?: Array<string> | null
}

interface VideoModelsListResponse {
  data: Array<VideoModel>
}

/**
 * Path rules — OpenRouter's generation surface spans the OpenAI-compatible
 * endpoints (chat/completions, completions-style responses, embeddings) and
 * the Anthropic-compatible /messages. Account management (auth/keys, byok,
 * credits, guardrails, workspaces, observability), the preset-scoped
 * endpoint variants, and rerank (no core activity) drop out of generation.
 *
 * Synthetic per-model video paths carry SYNTHETIC_VIDEO_MARKER on their POST
 * operation — that, not the path shape, is what routes them to `video`, so
 * real upstream additions under /videos/* never classify by accident.
 */
function classifyOpenRouter(
  path: string,
  post: Record<string, unknown>,
): Activity | null {
  if (
    path === '/chat/completions' ||
    path === '/messages' ||
    path === '/responses'
  ) {
    return 'chat'
  }
  if (path.startsWith('/audio/')) return 'audio'
  if (path === '/videos' || SYNTHETIC_VIDEO_MARKER in post) return 'video'
  if (path === '/embeddings') return 'embeddings'
  return null
}

type SpecShape = {
  paths?: Record<string, Record<string, any>>
  components?: { schemas?: Record<string, any> }
}

/**
 * OpenRouter declares the /embeddings request/response schemas inline rather
 * than via $ref, and the endpoint-map generator can only map endpoints whose
 * bodies resolve to named component schemas. Lift the inline shapes into
 * components.schemas under stable names and re-point the operation at them.
 */
function liftEmbeddingsSchemas(spec: SpecShape): void {
  const post = spec.paths?.['/embeddings']?.post
  const schemas = spec.components?.schemas
  if (!post || !schemas) return

  const requestContent = post.requestBody?.content?.['application/json']
  if (requestContent?.schema && !requestContent.schema.$ref) {
    schemas.EmbeddingsRequest = requestContent.schema
    requestContent.schema = { $ref: '#/components/schemas/EmbeddingsRequest' }
  }

  const responseContent = post.responses?.['200']?.content?.['application/json']
  if (responseContent?.schema && !responseContent.schema.$ref) {
    schemas.EmbeddingsResponse = responseContent.schema
    responseContent.schema = {
      $ref: '#/components/schemas/EmbeddingsResponse',
    }
  }
}

const SYNTHETIC_VIDEO_MARKER = 'x-tanstack-synthetic-video-model'

function toPascal(id: string): string {
  return id
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

/**
 * Synthesise one constrained VideoGenerationRequest variant per video model
 * from the cached GET /api/v1/videos/models metadata, mounted at a synthetic
 * `/videos/{model-id}` POST so the rest of the pipeline (codegen, $defs
 * bundling, endpoint maps) treats each model like any other endpoint.
 *
 * Field-level constraints (durations, resolutions, aspect ratios, sizes)
 * become enums; capabilities a model lacks (generate_audio, seed,
 * frame_images) drop out of its variant entirely. Cross-field rules the
 * metadata can't express structurally (supported frame types, passthrough
 * parameter allow-lists) land in field descriptions, per the package
 * convention.
 */
function synthesizeVideoModelEndpoints(
  spec: SpecShape,
  models: Array<VideoModel>,
): void {
  const basePost = spec.paths?.['/videos']?.post
  const baseRequest = spec.components?.schemas?.VideoGenerationRequest
  if (!basePost || !baseRequest || !spec.paths) return

  for (const model of models) {
    const schemaName = `VideoGenerationRequest${toPascal(model.id)}`
    const schema = structuredClone(baseRequest) as {
      description?: string
      properties: Record<string, any>
    }
    const props = schema.properties

    schema.description = [
      `${model.name} (${model.id}) — model-constrained video generation request.`,
      model.description?.trim(),
    ]
      .filter(Boolean)
      .join(' ')

    props.model = {
      type: 'string',
      enum: [model.id],
      description: 'Model id (fixed for this model-constrained schema)',
    }
    if (model.supported_durations?.length) {
      props.duration = { ...props.duration, enum: model.supported_durations }
    }
    if (model.supported_resolutions?.length) {
      props.resolution = {
        ...props.resolution,
        enum: model.supported_resolutions,
      }
    }
    if (model.supported_aspect_ratios?.length) {
      props.aspect_ratio = {
        ...props.aspect_ratio,
        enum: model.supported_aspect_ratios,
      }
    }
    if (model.supported_sizes?.length) {
      props.size = { ...props.size, enum: model.supported_sizes }
    }
    if (model.generate_audio !== true) delete props.generate_audio
    if (model.seed !== true) delete props.seed
    if (model.supported_frame_images?.length) {
      props.frame_images = {
        ...props.frame_images,
        description:
          `${props.frame_images.description ?? ''} Frame types supported by this model: ${model.supported_frame_images.join(', ')}.`.trim(),
      }
    } else {
      delete props.frame_images
    }
    if (model.allowed_passthrough_parameters?.length && props.provider) {
      props.provider = {
        ...props.provider,
        description:
          `${props.provider.description ?? ''} Passthrough parameters allowed for this model: ${model.allowed_passthrough_parameters.join(', ')}.`.trim(),
      }
    }

    spec.components!.schemas![schemaName] = schema
    spec.paths[`/videos/${model.id}`] = {
      post: {
        [SYNTHETIC_VIDEO_MARKER]: model.id,
        operationId: `createVideo${toPascal(model.id)}`,
        summary: `Generate a video with ${model.name}`,
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${schemaName}` },
            },
          },
          required: true,
        },
        responses: structuredClone(basePost.responses),
      },
    }
  }
}

function loadOpenRouter(): Array<ProviderCategorySpec> {
  const specDir = new URL('../specs/openrouter/', import.meta.url).pathname
  let raw: string
  try {
    raw = readFileSync(join(specDir, 'openrouter.openapi.json'), 'utf8')
  } catch {
    return []
  }
  const spec = JSON.parse(raw) as SpecShape

  liftEmbeddingsSchemas(spec)
  let videoModels: Array<VideoModel> = []
  try {
    videoModels = (
      JSON.parse(
        readFileSync(join(specDir, 'openrouter.video-models.json'), 'utf8'),
      ) as VideoModelsListResponse
    ).data
  } catch {
    // Metadata file absent (e.g. partial fetch) — the generic /videos
    // endpoint still generates; only the per-model variants are skipped.
  }
  synthesizeVideoModelEndpoints(spec, videoModels)

  applyTransforms(spec, { providerId: 'openrouter' })
  const mergedSpec: MergedSpec = mergeOpenAPISpecs([spec], 'OpenRouter API')
  return toActivitySpecs('openrouter', mergedSpec, classifyOpenRouter)
}

export const openrouterProvider: ProviderConfig = {
  id: 'openrouter',
  namespace: 'OpenRouter',
  fetch: fetchOpenRouter,
  load: loadOpenRouter,
  requiresAuth: false,
}
