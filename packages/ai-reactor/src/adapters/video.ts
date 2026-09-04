import { BaseLiveAdapter } from '@tanstack/ai/adapters'
import { generateId } from '@tanstack/ai-utils'
import {
  mintReactorSessionToken,
  resolveReactorApiKey,
  resolveReactorApiUrl,
} from '../utils/client'
import { REACTOR_VIDEO_SLUGS } from '../model-meta'
import type { ReactorClientConfig } from '../utils/client'
import type { LiveGenerationOptions, LiveGenerationResult } from '@tanstack/ai'
import type {
  ReactorVideoModel,
  ReactorVideoProviderOptions,
} from '../model-meta'

/**
 * Reactor live-video adapter. Mints a session-scoped JWT so a browser can
 * connect with `@reactor-team/js-sdk`, set the prompt, and start the stream.
 *
 * @example
 * ```ts
 * import { generateLive } from '@tanstack/ai'
 * import { reactorVideo } from '@tanstack/ai-reactor'
 *
 * const live = await generateLive({
 *   adapter: reactorVideo('helios'),
 *   prompt: 'A neon cyberpunk city at night',
 * })
 * ```
 */
export class ReactorVideoAdapter<
  TModel extends ReactorVideoModel,
> extends BaseLiveAdapter<TModel, ReactorVideoProviderOptions> {
  readonly name = 'reactor' as const
  private readonly clientConfig: ReactorClientConfig
  private readonly apiKey: string

  constructor(model: TModel, config: ReactorClientConfig = {}) {
    super(model, {})
    this.apiKey = resolveReactorApiKey(config)
    this.clientConfig = config
  }

  async createLive(
    options: LiveGenerationOptions<ReactorVideoProviderOptions>,
  ): Promise<LiveGenerationResult> {
    const { logger, prompt, abortSignal } = options
    const modelSlug = REACTOR_VIDEO_SLUGS[this.model]
    const apiUrl = resolveReactorApiUrl(this.clientConfig)

    logger.request(
      `activity=generateLive provider=reactor model=${modelSlug}`,
      { provider: 'reactor', model: modelSlug },
    )

    try {
      const token = await mintReactorSessionToken({
        apiKey: this.apiKey,
        apiUrl,
        modelSlug,
        fetchImpl: this.clientConfig.fetch,
        abortSignal,
      })

      const result: LiveGenerationResult = {
        id: generateId('live'),
        model: modelSlug,
        token: token.jwt,
        expiresAt: token.expires_at * 1000,
        prompt,
        status: 'ready',
      }

      logger.output(
        `activity=generateLive provider=reactor model=${modelSlug}`,
        { model: modelSlug, status: result.status },
      )

      return result
    } catch (error) {
      logger.errors('reactor.createLive failed', {
        error,
        source: 'reactor.createLive',
      })
      throw error
    }
  }
}

/**
 * Create a Reactor live-video adapter. Reads `REACTOR_API_KEY` when `apiKey` is
 * omitted.
 */
export function reactorVideo<TModel extends ReactorVideoModel>(
  model: TModel,
  config?: ReactorClientConfig,
): ReactorVideoAdapter<TModel> {
  return new ReactorVideoAdapter(model, config ?? {})
}

/**
 * Create a Reactor live-video adapter with an explicit API key.
 */
export function createReactorVideo<TModel extends ReactorVideoModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<ReactorClientConfig, 'apiKey'>,
): ReactorVideoAdapter<TModel> {
  return new ReactorVideoAdapter(model, { ...config, apiKey })
}
