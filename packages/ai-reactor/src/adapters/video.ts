import { resolveMediaPrompt } from '@tanstack/ai'
import { BaseVideoAdapter } from '@tanstack/ai/adapters'
import { generateId } from '@tanstack/ai-utils'
import {
  mintReactorSessionToken,
  resolveReactorApiKey,
  resolveReactorApiUrl,
} from '../utils/client'
import { REACTOR_VIDEO_SLUGS } from '../model-meta'
import type {
  VideoGenerationOptions,
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
} from '@tanstack/ai'
import type { ReactorClientConfig } from '../utils/client'
import type {
  ReactorVideoModel,
  ReactorVideoModelProviderOptionsByName,
  ReactorVideoProviderOptions,
} from '../model-meta'

const LIVE_SESSION_ERROR =
  'Reactor video is a live session. generateVideo() returns a token; connect with @reactor-team/js-sdk. There is no job URL to poll.'

/**
 * Reactor video adapter. Mints a session-scoped JWT so a browser can connect
 * with `@reactor-team/js-sdk`, set the prompt, and start the live stream.
 *
 * @example
 * ```ts
 * import { generateVideo } from '@tanstack/ai'
 * import { reactorVideo } from '@tanstack/ai-reactor'
 *
 * const video = await generateVideo({
 *   adapter: reactorVideo('helios'),
 *   prompt: 'A neon cyberpunk city at night',
 * })
 * ```
 */
export class ReactorVideoAdapter<
  TModel extends ReactorVideoModel,
> extends BaseVideoAdapter<
  TModel,
  ReactorVideoProviderOptions,
  ReactorVideoModelProviderOptionsByName
> {
  readonly name = 'reactor' as const
  private readonly clientConfig: ReactorClientConfig
  private readonly apiKey: string

  constructor(model: TModel, config: ReactorClientConfig = {}) {
    super({}, model)
    this.apiKey = resolveReactorApiKey(config)
    this.clientConfig = config
  }

  async createVideoJob(
    options: VideoGenerationOptions<ReactorVideoProviderOptions>,
  ): Promise<VideoJobResult> {
    const resolved = resolveMediaPrompt(options.prompt)
    if (resolved.videos.length > 0) {
      throw new Error(
        `${this.name}.createVideoJob does not support video prompt parts.`,
      )
    }
    if (resolved.audios.length > 0) {
      throw new Error(
        `${this.name}.createVideoJob does not support audio prompt parts.`,
      )
    }
    if (resolved.images.length > 0) {
      throw new Error(
        `${this.name}.createVideoJob does not upload reference images. Pass a text prompt. After connect, call uploadFile and set_image in the browser.`,
      )
    }
    if (resolved.text.length === 0) {
      throw new Error(`${this.name}.createVideoJob requires a text prompt.`)
    }

    const { logger, abortSignal } = options
    const modelSlug = REACTOR_VIDEO_SLUGS[this.model]
    const apiUrl = resolveReactorApiUrl(this.clientConfig)

    logger.request(
      `activity=generateVideo provider=reactor model=${modelSlug}`,
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

      const result: VideoJobResult = {
        jobId: generateId('video'),
        model: modelSlug,
        token: token.jwt,
        expiresAt: token.expires_at * 1000,
        prompt: resolved.text,
      }

      logger.output(
        `activity=generateVideo provider=reactor model=${modelSlug}`,
        { model: modelSlug, live: true },
      )

      return result
    } catch (error) {
      logger.errors('reactor.createVideoJob failed', {
        error,
        source: 'reactor.createVideoJob',
      })
      throw error
    }
  }

  async getVideoStatus(_jobId: string): Promise<VideoStatusResult> {
    throw new Error(LIVE_SESSION_ERROR)
  }

  async getVideoUrl(_jobId: string): Promise<VideoUrlResult> {
    throw new Error(LIVE_SESSION_ERROR)
  }
}

/**
 * Create a Reactor video adapter. Reads `REACTOR_API_KEY` when `apiKey` is
 * omitted.
 */
export function reactorVideo<TModel extends ReactorVideoModel>(
  model: TModel,
  config?: ReactorClientConfig,
): ReactorVideoAdapter<TModel> {
  return new ReactorVideoAdapter(model, config ?? {})
}

/**
 * Create a Reactor video adapter with an explicit API key.
 */
export function createReactorVideo<TModel extends ReactorVideoModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<ReactorClientConfig, 'apiKey'>,
): ReactorVideoAdapter<TModel> {
  return new ReactorVideoAdapter(model, { ...config, apiKey })
}
