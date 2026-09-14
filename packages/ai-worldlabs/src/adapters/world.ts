import { BaseWorldAdapter } from '@tanstack/ai/adapters'
import { generateId } from '@tanstack/ai-utils'
import { createWorldLabsClient } from '../utils/client'
import type { WorldLabsClientConfig } from '../utils/client'
import {
  generateWorldMarbleV1WorldsGeneratePost,
  getOperationMarbleV1OperationsOperationIdGet,
} from '../generated/sdk.gen'
import type {
  GenerateWorldResponse,
  GetOperationResponseUnionWorldPanoDepthToRgbResultExportWorldResult,
  World,
  WorldsGenerateRequest,
} from '../generated/types.gen'
import type { Client } from '../generated/client'
import type {
  WorldGenerationAssets,
  WorldGenerationOptions,
  WorldGenerationResult,
} from '@tanstack/ai'
import type {
  WorldLabsMediaRef,
  WorldLabsWorldModel,
  WorldLabsWorldProviderOptions,
} from '../model-meta'

export type { WorldLabsClientConfig }

const DEFAULT_POLL_INTERVAL_MS = 2_000

/**
 * World Labs Marble adapter. Starts a world generation job and, by default,
 * polls until the world is ready.
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

      if (modelOptions?.wait === false) {
        const result = pendingResult({
          prompt,
          model: this.model,
          operation: started,
        })
        logger.output(
          `activity=generateWorld provider=worldlabs model=${this.model}`,
          { model: this.model, status: result.status },
        )
        return result
      }

      if (started.done) {
        const result = completedResult({
          prompt,
          model: this.model,
          operation: started,
        })
        logger.output(
          `activity=generateWorld provider=worldlabs model=${this.model}`,
          { model: this.model, status: result.status },
        )
        return result
      }

      const finished = await this.pollUntilDone({
        operationId: started.operation_id,
        abortSignal,
        pollIntervalMs: modelOptions?.pollIntervalMs,
      })
      const result = completedResult({
        prompt,
        model: this.model,
        operation: finished,
      })
      logger.output(
        `activity=generateWorld provider=worldlabs model=${this.model}`,
        { model: this.model, status: result.status },
      )
      return result
    } catch (error) {
      logger.errors('worldlabs.createWorld failed', {
        error,
        source: 'worldlabs.createWorld',
      })
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
      ...(args.modelOptions?.displayName !== undefined
        ? { display_name: args.modelOptions.displayName }
        : {}),
      ...(args.modelOptions?.seed !== undefined
        ? { seed: args.modelOptions.seed }
        : {}),
      ...(args.modelOptions?.tags !== undefined
        ? { tags: args.modelOptions.tags }
        : {}),
      ...(args.modelOptions?.permission !== undefined
        ? { permission: args.modelOptions.permission }
        : {}),
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
  }): Promise<GetOperationResponseUnionWorldPanoDepthToRgbResultExportWorldResult> {
    const interval =
      args.pollIntervalMs !== undefined && args.pollIntervalMs > 0
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
  return new WorldLabsWorldAdapter(model, config ?? {})
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
  const imageCount = options?.image ? 1 : 0
  const imagesCount = options?.images ? 1 : 0
  const videoCount = options?.video ? 1 : 0
  if (imageCount + imagesCount + videoCount > 1) {
    throw new Error(
      'World Labs: pass only one of modelOptions.image, modelOptions.images, or modelOptions.video.',
    )
  }

  const textPrompt = prompt.trim().length > 0 ? prompt : undefined
  const disableRecaption = options?.disableRecaption

  if (options?.image) {
    return {
      type: 'image',
      image_prompt: toContentRef(options.image),
      ...(textPrompt !== undefined ? { text_prompt: textPrompt } : {}),
      ...(disableRecaption !== undefined
        ? { disable_recaption: disableRecaption }
        : {}),
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
      ...(textPrompt !== undefined ? { text_prompt: textPrompt } : {}),
      ...(disableRecaption !== undefined
        ? { disable_recaption: disableRecaption }
        : {}),
    }
  }

  if (options?.video) {
    return {
      type: 'video',
      video_prompt: toContentRef(options.video),
      ...(textPrompt !== undefined ? { text_prompt: textPrompt } : {}),
      ...(disableRecaption !== undefined
        ? { disable_recaption: disableRecaption }
        : {}),
    }
  }

  return {
    type: 'text',
    text_prompt: prompt,
    ...(disableRecaption !== undefined
      ? { disable_recaption: disableRecaption }
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
  if (ref.uri) {
    return { source: 'uri', uri: ref.uri }
  }
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
  return {
    id: args.operation.operation_id,
    model: args.model,
    prompt: args.prompt,
    status: 'waiting',
    operationId: args.operation.operation_id,
    worldId: worldIdFromMetadata(args.operation.metadata),
    ...(expiresAtMs(args.operation.expires_at) !== undefined
      ? { expiresAt: expiresAtMs(args.operation.expires_at) }
      : {}),
  }
}

function completedResult(args: {
  prompt: string
  model: string
  operation:
    | GenerateWorldResponse
    | GetOperationResponseUnionWorldPanoDepthToRgbResultExportWorldResult
}): WorldGenerationResult {
  if (args.operation.error) {
    const message =
      args.operation.error.message ??
      `World Labs operation failed${
        args.operation.error.code != null
          ? ` (code ${args.operation.error.code})`
          : ''
      }`
    throw new Error(message)
  }

  const world = worldFromResponse(args.operation.response)
  if (!world) {
    throw new Error(
      `World Labs operation ${args.operation.operation_id} completed without a world.`,
    )
  }

  return {
    id: world.world_id || generateId('world'),
    model: world.model ?? args.model,
    prompt: args.prompt,
    status: 'ready',
    url: world.world_marble_url,
    worldId: world.world_id,
    operationId: args.operation.operation_id,
    ...(mapAssets(world.assets) ? { assets: mapAssets(world.assets) } : {}),
    ...(expiresAtMs(args.operation.expires_at) !== undefined
      ? { expiresAt: expiresAtMs(args.operation.expires_at) }
      : {}),
  }
}

function worldFromResponse(
  response:
    | GenerateWorldResponse['response']
    | GetOperationResponseUnionWorldPanoDepthToRgbResultExportWorldResult['response'],
): World | undefined {
  if (!response || typeof response !== 'object') return undefined
  if (!('world_id' in response) || !('world_marble_url' in response)) {
    return undefined
  }
  return response as World
}

function worldIdFromMetadata(
  metadata: GenerateWorldResponse['metadata'],
): string | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined
  const worldId = metadata.world_id
  return typeof worldId === 'string' && worldId.length > 0 ? worldId : undefined
}

function mapAssets(assets: World['assets']): WorldGenerationAssets | undefined {
  if (!assets) return undefined
  const mapped: WorldGenerationAssets = {
    ...(assets.caption ? { caption: assets.caption } : {}),
    ...(assets.thumbnail_url ? { thumbnailUrl: assets.thumbnail_url } : {}),
    ...(assets.splats
      ? {
          splats: {
            ...(assets.splats.spz_urls
              ? { spzUrls: assets.splats.spz_urls }
              : {}),
            ...(assets.splats.semantics_metadata?.metric_scale_factor != null
              ? {
                  metricScaleFactor:
                    assets.splats.semantics_metadata.metric_scale_factor,
                }
              : {}),
            ...(assets.splats.semantics_metadata?.ground_plane_offset != null
              ? {
                  groundPlaneOffset:
                    assets.splats.semantics_metadata.ground_plane_offset,
                }
              : {}),
          },
        }
      : {}),
    ...(assets.mesh
      ? {
          mesh: {
            ...(assets.mesh.collider_mesh_url
              ? { colliderMeshUrl: assets.mesh.collider_mesh_url }
              : {}),
            ...(assets.mesh.hq_mesh_url
              ? { hqMeshUrl: assets.mesh.hq_mesh_url }
              : {}),
            ...(assets.mesh.full_res_mesh_url
              ? { fullResMeshUrl: assets.mesh.full_res_mesh_url }
              : {}),
          },
        }
      : {}),
    ...(assets.imagery?.pano_url
      ? { imagery: { panoUrl: assets.imagery.pano_url } }
      : {}),
  }
  return Object.keys(mapped).length > 0 ? mapped : undefined
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
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal))
      return
    }
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError(signal))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function abortError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) return signal.reason
  return new Error('The operation was aborted')
}
