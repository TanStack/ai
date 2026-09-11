import { BaseLiveVideoAdapter } from '@tanstack/ai/adapters'
import { generateId } from '@tanstack/ai-utils'
import { getFalApiKeyFromEnv } from '../utils/client'
import type {
  LiveVideoGenerationOptions,
  LiveVideoGenerationResult,
} from '@tanstack/ai'
import type { FalClientConfig } from '../utils/client'

const DEFAULT_FAL_TOKEN_URL = 'https://rest.fal.ai/tokens/'
const DEFAULT_TOKEN_DURATION_SECONDS = 300

export const FAL_LIVE_VIDEO_MODELS = ['minimax/h3-max/director'] as const

export type FalLiveVideoModel = (typeof FAL_LIVE_VIDEO_MODELS)[number]

/**
 * WMA / token app id for each public live model. Director's AsyncAPI lives at
 * `fal-ai/minimax-h3-max-director`. `wma()` and `/tokens/` must use this id:
 * `minimax/h3-max/director` parses as alias `h3-max`.
 */
export const FAL_LIVE_VIDEO_APP = {
  'minimax/h3-max/director': 'fal-ai/minimax-h3-max-director',
} as const satisfies Record<FalLiveVideoModel, string>

export function isFalLiveVideoModel(model: string): model is FalLiveVideoModel {
  return (FAL_LIVE_VIDEO_MODELS as ReadonlyArray<string>).includes(model)
}

const WMA_PROXY_PATHS = new Set(['/ice', '/session', '/session/heartbeat'])

/**
 * URLs a Director live proxy may forward. WMA talks to `wma.fal.run`
 * (`/ice`, `/session`, `/session/heartbeat`). ICE can fall back to
 * `fal.run/<app>/ice`. Anything else, including `queue.fal.run`, is
 * rejected so the proxy cannot run arbitrary fal apps.
 */
export function allowedFalLiveVideoProxyTarget(raw: string): URL | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.username || url.password || url.port || url.search || url.hash) {
    return null
  }
  const path = url.pathname.replace(/\/$/, '') || '/'
  if (url.hostname === 'wma.fal.run') {
    return WMA_PROXY_PATHS.has(path) ? url : null
  }
  if (url.hostname === 'fal.run') {
    for (const app of Object.values(FAL_LIVE_VIDEO_APP)) {
      if (path === `/${app}/ice`) return url
    }
  }
  return null
}

/**
 * Provider options for fal live sessions. The browser applies resolution and
 * aspect ratio on the WMA `configure` message. `tokenDuration` is the only
 * server-side field: it sets how long the minted JWT lasts.
 */
export interface FalLiveVideoProviderOptions {
  /** JWT lifetime in seconds. Defaults to 300. */
  tokenDuration?: number
}

export type FalLiveVideoModelProviderOptionsByName = {
  [M in FalLiveVideoModel]: FalLiveVideoProviderOptions
}

function resolveFalLiveApiKey(config?: FalClientConfig): string {
  return config?.apiKey ?? getFalApiKeyFromEnv()
}

function readFalToken(body: unknown): string {
  if (typeof body === 'string' && body.length > 0) return body
  if (typeof body === 'object' && body !== null && 'token' in body) {
    const token = body.token
    if (typeof token === 'string' && token.length > 0) return token
  }
  throw new Error('fal token response did not include a token.')
}

/**
 * fal live-video adapter. Mints a scoped JWT and returns the WMA app id on
 * `result.model`. Open with `fal.realtime.open(wma(live.model))` through a
 * server proxy that attaches `FAL_KEY`. WMA rejects the JWT as Key
 * credentials.
 *
 * @example
 * ```ts
 * import { generateLiveVideo } from '@tanstack/ai'
 * import { falLiveVideo } from '@tanstack/ai-fal'
 *
 * const live = await generateLiveVideo({
 *   adapter: falLiveVideo('minimax/h3-max/director'),
 *   prompt: 'A chef tosses noodles in a steel wok, flames leaping',
 * })
 * // live.model is 'fal-ai/minimax-h3-max-director'
 * ```
 */
export class FalLiveVideoAdapter<
  TModel extends FalLiveVideoModel,
> extends BaseLiveVideoAdapter<TModel, FalLiveVideoProviderOptions> {
  readonly name = 'fal' as const
  private readonly clientConfig: FalClientConfig | undefined
  private readonly apiKey: string

  constructor(model: TModel, config?: FalClientConfig) {
    super(model, {})
    this.apiKey = resolveFalLiveApiKey(config)
    this.clientConfig = config
  }

  async createLiveVideo(
    options: LiveVideoGenerationOptions<FalLiveVideoProviderOptions>,
  ): Promise<LiveVideoGenerationResult> {
    const { logger, prompt, abortSignal, modelOptions } = options
    const tokenDuration =
      modelOptions?.tokenDuration ?? DEFAULT_TOKEN_DURATION_SECONDS
    const fetchImpl = this.clientConfig?.fetch ?? globalThis.fetch

    logger.request(
      `activity=generateLiveVideo provider=fal model=${this.model}`,
      {
        provider: 'fal',
        model: this.model,
      },
    )

    if (typeof fetchImpl !== 'function') {
      throw new Error(
        'global fetch is not available. Pass `fetch` in the fal adapter config.',
      )
    }

    try {
      const response = await fetchImpl(DEFAULT_FAL_TOKEN_URL, {
        method: 'POST',
        headers: {
          Authorization: `Key ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          allowed_apps: [FAL_LIVE_VIDEO_APP[this.model]],
          token_expiration: tokenDuration,
        }),
        ...(abortSignal ? { signal: abortSignal } : {}),
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(
          `fal token request failed (${response.status}${
            response.statusText ? ` ${response.statusText}` : ''
          })${detail ? `: ${detail}` : ''}`,
        )
      }

      const token = readFalToken(await response.json())
      const result: LiveVideoGenerationResult = {
        id: generateId('liveVideo'),
        model: FAL_LIVE_VIDEO_APP[this.model],
        token,
        expiresAt: Date.now() + tokenDuration * 1000,
        prompt,
        status: 'ready',
      }

      logger.output(
        `activity=generateLiveVideo provider=fal model=${this.model}`,
        {
          model: this.model,
          status: result.status,
        },
      )

      return result
    } catch (error) {
      logger.errors('fal.createLiveVideo failed', {
        error,
        source: 'fal.createLiveVideo',
      })
      throw error
    }
  }
}

/**
 * Create a fal live-video adapter. Reads `FAL_KEY` when `apiKey` is omitted.
 */
export function falLiveVideo<TModel extends FalLiveVideoModel>(
  model: TModel,
  config?: FalClientConfig,
): FalLiveVideoAdapter<TModel> {
  return new FalLiveVideoAdapter(model, config)
}

/**
 * Create a fal live-video adapter with an explicit API key.
 */
export function createFalLiveVideo<TModel extends FalLiveVideoModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<FalClientConfig, 'apiKey'>,
): FalLiveVideoAdapter<TModel> {
  return new FalLiveVideoAdapter(model, { ...config, apiKey })
}
