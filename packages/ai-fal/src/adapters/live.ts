import { BaseLiveAdapter } from '@tanstack/ai/adapters'
import { generateId } from '@tanstack/ai-utils'
import { getFalApiKeyFromEnv } from '../utils/client'
import type { LiveGenerationOptions, LiveGenerationResult } from '@tanstack/ai'
import type { FalClientConfig } from '../utils/client'

const DEFAULT_FAL_REALTIME_TOKEN_URL = 'https://rest.fal.ai/tokens/realtime'
const DEFAULT_TOKEN_DURATION_SECONDS = 300

export const FAL_LIVE_MODELS = ['minimax/h3-max/director'] as const

export type FalLiveModel = (typeof FAL_LIVE_MODELS)[number]

export function isFalLiveModel(model: string): model is FalLiveModel {
  return (FAL_LIVE_MODELS as ReadonlyArray<string>).includes(model)
}

/**
 * Provider options for fal live sessions. The browser applies resolution and
 * aspect ratio on the WMA `configure` message. `tokenDuration` is the only
 * server-side field: it sets how long the minted JWT lasts.
 */
export interface FalLiveProviderOptions {
  /** JWT lifetime in seconds. Defaults to 300. */
  tokenDuration?: number
}

export type FalLiveModelProviderOptionsByName = {
  [M in FalLiveModel]: FalLiveProviderOptions
}

function resolveFalLiveApiKey(config?: FalClientConfig): string {
  return config?.apiKey ?? getFalApiKeyFromEnv()
}

function readFalRealtimeToken(body: unknown): string {
  if (typeof body === 'string' && body.length > 0) return body
  if (typeof body === 'object' && body !== null && 'token' in body) {
    const token = body.token
    if (typeof token === 'string' && token.length > 0) return token
  }
  throw new Error('fal realtime token response did not include a token.')
}

/**
 * fal live-video adapter. Mints a scoped realtime JWT so a browser can open
 * H3 Max Director with `fal.realtime.open(wma(...))`.
 *
 * @example
 * ```ts
 * import { generateLive } from '@tanstack/ai'
 * import { falLive } from '@tanstack/ai-fal'
 *
 * const live = await generateLive({
 *   adapter: falLive('minimax/h3-max/director'),
 *   prompt: 'A chef tosses noodles in a steel wok, flames leaping',
 * })
 * ```
 */
export class FalLiveAdapter<
  TModel extends FalLiveModel,
> extends BaseLiveAdapter<TModel, FalLiveProviderOptions> {
  readonly name = 'fal' as const
  private readonly clientConfig: FalClientConfig | undefined
  private readonly apiKey: string

  constructor(model: TModel, config?: FalClientConfig) {
    super(model, {})
    this.apiKey = resolveFalLiveApiKey(config)
    this.clientConfig = config
  }

  async createLive(
    options: LiveGenerationOptions<FalLiveProviderOptions>,
  ): Promise<LiveGenerationResult> {
    const { logger, prompt, abortSignal, modelOptions } = options
    const tokenDuration =
      modelOptions?.tokenDuration ?? DEFAULT_TOKEN_DURATION_SECONDS
    const fetchImpl = this.clientConfig?.fetch ?? globalThis.fetch

    logger.request(`activity=generateLive provider=fal model=${this.model}`, {
      provider: 'fal',
      model: this.model,
    })

    if (typeof fetchImpl !== 'function') {
      throw new Error(
        'global fetch is not available. Pass `fetch` in the fal adapter config.',
      )
    }

    try {
      const response = await fetchImpl(DEFAULT_FAL_REALTIME_TOKEN_URL, {
        method: 'POST',
        headers: {
          Authorization: `Key ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          allowed_apps: [this.model],
          duration: tokenDuration,
        }),
        ...(abortSignal ? { signal: abortSignal } : {}),
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(
          `fal realtime token request failed (${response.status}${
            response.statusText ? ` ${response.statusText}` : ''
          })${detail ? `: ${detail}` : ''}`,
        )
      }

      const token = readFalRealtimeToken(await response.json())
      const result: LiveGenerationResult = {
        id: generateId('live'),
        model: this.model,
        token,
        expiresAt: Date.now() + tokenDuration * 1000,
        prompt,
        status: 'ready',
      }

      logger.output(`activity=generateLive provider=fal model=${this.model}`, {
        model: this.model,
        status: result.status,
      })

      return result
    } catch (error) {
      logger.errors('fal.createLive failed', {
        error,
        source: 'fal.createLive',
      })
      throw error
    }
  }
}

/**
 * Create a fal live-video adapter. Reads `FAL_KEY` when `apiKey` is omitted.
 */
export function falLive<TModel extends FalLiveModel>(
  model: TModel,
  config?: FalClientConfig,
): FalLiveAdapter<TModel> {
  return new FalLiveAdapter(model, config)
}

/**
 * Create a fal live-video adapter with an explicit API key.
 */
export function createFalLive<TModel extends FalLiveModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<FalClientConfig, 'apiKey'>,
): FalLiveAdapter<TModel> {
  return new FalLiveAdapter(model, { ...config, apiKey })
}
