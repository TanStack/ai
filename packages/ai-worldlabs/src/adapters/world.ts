import { BaseWorldAdapter } from '@tanstack/ai/adapters'
import {
  generateWorldMarbleV1WorldsGeneratePost,
  getOperationMarbleV1OperationsOperationIdGet,
} from '../generated/sdk.gen'
import {
  createWorldLabsClient,
  getWorldLabsApiKeyFromEnv,
} from '../utils/client'
import type {
  WorldGenerationAssets,
  WorldGenerationOptions,
  WorldGenerationResult,
} from '@tanstack/ai'
import type { Client } from '../generated/client'
import type {
  GenerateWorldResponse,
  GetOperationResponseUnionWorldPanoDepthToRgbResultExportWorldResult,
  World,
  WorldsGenerateRequest,
} from '../generated/types.gen'
import type {
  WorldLabsMediaRef,
  WorldLabsWorldModel,
  WorldLabsWorldProviderOptions,
} from '../model-meta'
import type { WorldLabsClientConfig } from '../utils/client'

export type { WorldLabsClientConfig }

type WorldOperation =
  | GenerateWorldResponse
  | GetOperationResponseUnionWorldPanoDepthToRgbResultExportWorldResult

const DEFAULT_POLL_INTERVAL_MS = 2_000

/**
 * World Labs Marble adapter. Starts a world generation job and, by default,
 * polls until the world is ready. `modelOptions.wait === false` returns
 * `operationId` at once. A later `generateWorld` call cannot resume that id.
 *
 * @example
 * ```ts
 * import { generateWorld } from '@tanstack/ai'
 * import { worldlabsWorld } from '@tanstack/ai-worldlabs'
 *
 * const world = await generateWorld({
 *   adapter: worldlabsWorld('marble-1.1'),
 *   prompt: 'A mystical forest with glowing mushrooms',
 * })
 * ```
 */
export class WorldLabsWorldAdapter<
  TModel extends WorldLabsWorldModel,
> extends BaseWorldAdapter<TModel, WorldLabsWorldProviderOptions> {
  readonly name = 'worldlabs' as const
  private readonly client: Client

  constructor(model: TModel, config: WorldLabsClientConfig = {}) {
    super(model, {})
    this.client = createWorldLabsClient(config).client
  }

  async createWorld(
    options: WorldGenerationOptions<WorldLabsWorldProviderOptions>,
  ): Promise<WorldGenerationResult> {
    const { logger, prompt, abortSignal, modelOptions } = options

    logger.request(
      `activity=generateWorld provider=worldlabs model=${this.model}`,
      { provider: 'worldlabs', model: this.model },
    )

    try {
      const started = await this.startGeneration({
        prompt,
        modelOptions,
        abortSignal,
      })
      requireOperationId(started)

      if (started.done || started.error) {
        return logWorldResult(
          logger,
          this.model,
          completedResult({
            prompt,
            model: this.model,
            operation: started,
          }),
        )
      }

      if (modelOptions?.wait === false) {
        return logWorldResult(
          logger,
          this.model,
          pendingResult({
            prompt,
            model: this.model,
            operation: started,
          }),
        )
      }

      const finished = await this.pollUntilDone({
        operationId: started.operation_id,
        abortSignal,
        pollIntervalMs: modelOptions?.pollIntervalMs,
      })
      return logWorldResult(
        logger,
        this.model,
        completedResult({
          prompt,
          model: this.model,
          operation: finished,
        }),
      )
    } catch (error) {
      if (!isAbortError(error)) {
        logger.errors('worldlabs.createWorld failed', {
          error,
          source: 'worldlabs.createWorld',
        })
      }
      throw error
    }
  }

  private async startGeneration(args: {
    prompt: string
    modelOptions?: WorldLabsWorldProviderOptions
    abortSignal?: AbortSignal
  }): Promise<GenerateWorldResponse> {
    const body: WorldsGenerateRequest = {
      model: this.model,
      world_prompt: buildWorldPrompt(args.prompt, args.modelOptions),
    }
    if (args.modelOptions?.displayName !== undefined) {
      body.display_name = args.modelOptions.displayName
    }
    if (args.modelOptions?.seed !== undefined) {
      body.seed = args.modelOptions.seed
    }
    if (args.modelOptions?.tags !== undefined) {
      body.tags = args.modelOptions.tags
    }
    if (args.modelOptions?.permission !== undefined) {
      body.permission = args.modelOptions.permission
    }

    const result = await generateWorldMarbleV1WorldsGeneratePost({
      client: this.client,
      body,
      ...(args.abortSignal ? { signal: args.abortSignal } : {}),
    })

    if (result.error || !result.data) {
      throw worldLabsRequestError(
        'World Labs generate request failed',
        result.response,
        result.error,
      )
    }

    return result.data
  }

  private async pollUntilDone(args: {
    operationId: string
    abortSignal?: AbortSignal
    pollIntervalMs?: number
  }): Promise<WorldOperation> {
    const interval =
      args.pollIntervalMs && args.pollIntervalMs > 0
        ? args.pollIntervalMs
        : DEFAULT_POLL_INTERVAL_MS

    for (;;) {
      await sleep(interval, args.abortSignal)
      const result = await getOperationMarbleV1OperationsOperationIdGet({
        client: this.client,
        path: { operation_id: args.operationId },
        ...(args.abortSignal ? { signal: args.abortSignal } : {}),
      })

      if (result.error || !result.data) {
        throw worldLabsRequestError(
          'World Labs operation poll failed',
          result.response,
          result.error,
        )
      }

      if (typeof result.data.done !== 'boolean') {
        throw new Error(
          `World Labs operation ${args.operationId} returned an invalid poll payload.`,
        )
      }

      if (result.data.done) {
        return result.data
      }
    }
  }
}

/**
 * Create a World Labs world adapter. Reads `WORLDLABS_API_KEY` when `apiKey`
 * is omitted.
 */
export function worldlabsWorld<TModel extends WorldLabsWorldModel>(
  model: TModel,
  config?: WorldLabsClientConfig,
): WorldLabsWorldAdapter<TModel> {
  const apiKey = config?.apiKey ?? getWorldLabsApiKeyFromEnv()
  return createWorldLabsWorld(model, apiKey, config)
}

/**
 * Create a World Labs world adapter with an explicit API key.
 */
export function createWorldLabsWorld<TModel extends WorldLabsWorldModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<WorldLabsClientConfig, 'apiKey'>,
): WorldLabsWorldAdapter<TModel> {
  return new WorldLabsWorldAdapter(model, { ...config, apiKey })
}

function buildWorldPrompt(
  prompt: string,
  options?: WorldLabsWorldProviderOptions,
): WorldsGenerateRequest['world_prompt'] {
  if (
    [options?.image, options?.images, options?.video].filter(Boolean).length > 1
  ) {
    throw new Error(
      'World Labs: pass only one of modelOptions.image, modelOptions.images, or modelOptions.video.',
    )
  }

  const textPrompt = prompt.trim().length > 0 ? prompt : undefined
  const shared = {
    ...(textPrompt !== undefined ? { text_prompt: textPrompt } : {}),
    ...(options?.disableRecaption !== undefined
      ? { disable_recaption: options.disableRecaption }
      : {}),
  }

  if (options?.image) {
    return {
      type: 'image',
      image_prompt: toContentRef(options.image),
      ...shared,
      ...(options.isPano !== undefined ? { is_pano: options.isPano } : {}),
    }
  }

  if (options?.images) {
    return {
      type: 'multi-image',
      multi_image_prompt: options.images.map((image) => ({
        content: toContentRef(image),
        ...(image.azimuth !== undefined ? { azimuth: image.azimuth } : {}),
      })),
      ...shared,
    }
  }

  if (options?.video) {
    return {
      type: 'video',
      video_prompt: toContentRef(options.video),
      ...shared,
    }
  }

  return {
    type: 'text',
    text_prompt: prompt,
    ...(options?.disableRecaption !== undefined
      ? { disable_recaption: options.disableRecaption }
      : {}),
  }
}

function toContentRef(
  ref: WorldLabsMediaRef,
):
  | { source: 'uri'; uri: string }
  | { source: 'media_asset'; media_asset_id: string }
  | { source: 'data_base64'; data_base64: string; extension?: string } {
  const fields = [ref.uri, ref.mediaAssetId, ref.dataBase64].filter(
    (value) => typeof value === 'string' && value.length > 0,
  )
  if (fields.length !== 1) {
    throw new Error(
      'World Labs media ref needs exactly one of uri, mediaAssetId, or dataBase64.',
    )
  }
  if (ref.uri) return { source: 'uri', uri: ref.uri }
  if (ref.mediaAssetId) {
    return { source: 'media_asset', media_asset_id: ref.mediaAssetId }
  }
  if (!ref.dataBase64) {
    throw new Error(
      'World Labs media ref needs exactly one of uri, mediaAssetId, or dataBase64.',
    )
  }
  return {
    source: 'data_base64',
    data_base64: ref.dataBase64,
    ...(ref.extension !== undefined ? { extension: ref.extension } : {}),
  }
}

function pendingResult(args: {
  prompt: string
  model: string
  operation: GenerateWorldResponse
}): WorldGenerationResult {
  const expiresAt = expiresAtMs(args.operation.expires_at)
  return {
    id: args.operation.operation_id,
    model: args.model,
    prompt: args.prompt,
    status: 'waiting',
    operationId: args.operation.operation_id,
    worldId: worldIdFromMetadata(args.operation.metadata),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
  }
}

function completedResult(args: {
  prompt: string
  model: string
  operation: WorldOperation
}): WorldGenerationResult {
  if (args.operation.error) {
    const raw = args.operation.error.message?.trim()
    const code = args.operation.error.code
    throw new Error(
      raw ||
        `World Labs operation failed${code != null ? ` (code ${code})` : ''}`,
    )
  }

  const world = worldFromResponse(args.operation.response)
  if (!world) {
    throw new Error(
      `World Labs operation ${args.operation.operation_id} completed without a world.`,
    )
  }

  const assets = mapAssets(world.assets)
  const expiresAt = expiresAtMs(args.operation.expires_at)
  return {
    id: world.world_id,
    model: world.model ?? args.model,
    prompt: args.prompt,
    status: 'ready',
    url: world.world_marble_url,
    worldId: world.world_id,
    operationId: args.operation.operation_id,
    ...(assets ? { assets } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
  }
}

function worldFromResponse(
  response: WorldOperation['response'],
): World | undefined {
  if (!response || typeof response !== 'object') return undefined
  if (!('world_id' in response) || !('world_marble_url' in response)) {
    return undefined
  }
  const worldId = response.world_id
  const url = response.world_marble_url
  if (typeof worldId !== 'string' || worldId.length === 0) return undefined
  if (typeof url !== 'string' || url.length === 0) return undefined
  return response as World
}

function requireOperationId(data: GenerateWorldResponse): void {
  if (typeof data.operation_id !== 'string' || data.operation_id.length === 0) {
    throw new Error('World Labs generate request failed: missing operation_id')
  }
}

function logWorldResult(
  logger: WorldGenerationOptions['logger'],
  model: string,
  result: WorldGenerationResult,
): WorldGenerationResult {
  logger.output(`activity=generateWorld provider=worldlabs model=${model}`, {
    model,
    status: result.status,
  })
  return result
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.message === 'The operation was aborted')
  )
}

function worldIdFromMetadata(
  metadata: GenerateWorldResponse['metadata'],
): string | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined
  const worldId = metadata.world_id
  return typeof worldId === 'string' && worldId.length > 0 ? worldId : undefined
}

function nonEmpty<T extends object>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined
}

function mapAssets(assets: World['assets']): WorldGenerationAssets | undefined {
  if (!assets) return undefined
  const splats = mapSplatAssets(assets.splats)
  const mesh = mapMeshAssets(assets.mesh)
  return nonEmpty({
    ...(assets.caption ? { caption: assets.caption } : {}),
    ...(assets.thumbnail_url ? { thumbnailUrl: assets.thumbnail_url } : {}),
    ...(splats ? { splats } : {}),
    ...(mesh ? { mesh } : {}),
    ...(assets.imagery?.pano_url
      ? { imagery: { panoUrl: assets.imagery.pano_url } }
      : {}),
  })
}

function mapSplatAssets(
  splats: NonNullable<World['assets']>['splats'],
): WorldGenerationAssets['splats'] | undefined {
  if (!splats) return undefined
  return nonEmpty({
    ...(splats.spz_urls && Object.keys(splats.spz_urls).length > 0
      ? { spzUrls: splats.spz_urls }
      : {}),
    ...(splats.semantics_metadata?.metric_scale_factor != null
      ? { metricScaleFactor: splats.semantics_metadata.metric_scale_factor }
      : {}),
    ...(splats.semantics_metadata?.ground_plane_offset != null
      ? { groundPlaneOffset: splats.semantics_metadata.ground_plane_offset }
      : {}),
  })
}

function mapMeshAssets(
  mesh: NonNullable<World['assets']>['mesh'],
): WorldGenerationAssets['mesh'] | undefined {
  if (!mesh) return undefined
  return nonEmpty({
    ...(mesh.collider_mesh_url
      ? { colliderMeshUrl: mesh.collider_mesh_url }
      : {}),
    ...(mesh.hq_mesh_url ? { hqMeshUrl: mesh.hq_mesh_url } : {}),
    ...(mesh.full_res_mesh_url
      ? { fullResMeshUrl: mesh.full_res_mesh_url }
      : {}),
  })
}

function expiresAtMs(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function worldLabsRequestError(
  prefix: string,
  response: Response | undefined,
  error: unknown,
): Error {
  const status = response
    ? `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
    : undefined
  const detail = errorDetail(error)
  return new Error(
    `${prefix}${status ? ` (${status})` : ''}${detail ? `: ${detail}` : ''}`,
  )
}

function errorDetail(error: unknown): string | undefined {
  if (typeof error === 'string' && error.length > 0) return error
  if (typeof error === 'object' && error !== null) {
    const record = error as { detail?: unknown; message?: unknown }
    if (typeof record.detail === 'string' && record.detail.length > 0) {
      return record.detail
    }
    if (typeof record.message === 'string' && record.message.length > 0) {
      return record.message
    }
    try {
      return JSON.stringify(error)
    } catch {
      return undefined
    }
  }
  return undefined
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
  if (signal.aborted) {
    return Promise.reject(abortError(signal))
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError(signal))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function abortError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) return signal.reason
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}
