import { BaseWorldAdapter } from '@tanstack/ai/adapters'
import { generateId } from '@tanstack/ai-utils'
import {
  mintReactorSessionToken,
  resolveReactorApiKey,
  resolveReactorApiUrl,
} from '../utils/client'
import { REACTOR_WORLD_SLUGS } from '../model-meta'
import type { ReactorClientConfig } from '../utils/client'
import type {
  WorldGenerationOptions,
  WorldGenerationResult,
} from '@tanstack/ai'
import type {
  ReactorWorldModel,
  ReactorWorldProviderOptions,
} from '../model-meta'

export type { ReactorClientConfig }

/**
 * Reactor world adapter. Mints a session-scoped JWT so a browser can connect
 * with `@reactor-team/js-sdk`, set the prompt, and start the live stream.
 *
 * @example
 * ```ts
 * import { generateWorld } from '@tanstack/ai'
 * import { reactorWorld } from '@tanstack/ai-reactor'
 *
 * const world = await generateWorld({
 *   adapter: reactorWorld('visko-orbis-stable'),
 *   prompt: 'A neon cyberpunk city at night',
 * })
 * ```
 */
export class ReactorWorldAdapter<
  TModel extends ReactorWorldModel,
> extends BaseWorldAdapter<TModel, ReactorWorldProviderOptions> {
  readonly name = 'reactor' as const
  private readonly clientConfig: ReactorClientConfig
  private readonly apiKey: string

  constructor(model: TModel, config: ReactorClientConfig = {}) {
    super(model, {})
    this.apiKey = resolveReactorApiKey(config)
    this.clientConfig = config
  }

  async createWorld(
    options: WorldGenerationOptions<ReactorWorldProviderOptions>,
  ): Promise<WorldGenerationResult> {
    const { logger, prompt, abortSignal } = options
    const modelSlug = REACTOR_WORLD_SLUGS[this.model]
    const apiUrl = resolveReactorApiUrl(this.clientConfig)

    logger.request(
      `activity=generateWorld provider=reactor model=${modelSlug}`,
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

      const result: WorldGenerationResult = {
        id: generateId('world'),
        model: modelSlug,
        token: token.jwt,
        expiresAt: token.expires_at * 1000,
        prompt,
        status: 'ready',
      }

      logger.output(
        `activity=generateWorld provider=reactor model=${modelSlug}`,
        { model: modelSlug, status: result.status },
      )

      return result
    } catch (error) {
      logger.errors('reactor.createWorld failed', {
        error,
        source: 'reactor.createWorld',
      })
      throw error
    }
  }
}

/**
 * Create a Reactor world adapter. Reads `REACTOR_API_KEY` when `apiKey` is
 * omitted.
 */
export function reactorWorld<TModel extends ReactorWorldModel>(
  model: TModel,
  config?: ReactorClientConfig,
): ReactorWorldAdapter<TModel> {
  return new ReactorWorldAdapter(model, config ?? {})
}

/**
 * Create a Reactor world adapter with an explicit API key.
 */
export function createReactorWorld<TModel extends ReactorWorldModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<ReactorClientConfig, 'apiKey'>,
): ReactorWorldAdapter<TModel> {
  return new ReactorWorldAdapter(model, { ...config, apiKey })
}
