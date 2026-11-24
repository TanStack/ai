import { BaseEvaluateAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { buildBaseUsage } from '@tanstack/ai'
import { resolveConfigFromEnv } from '../utils/config'
import { runModel } from '../utils/run'
import type { EvaluateOptions, WireAnswer } from '@tanstack/ai/adapters'
import type {
  CloudflareAdapterConfig,
  CloudflareConfig,
  CloudflareConfigInput,
} from '../utils/config'
import type { CloudflareEvaluateModel } from '../utils/models'

/** Extra Workers AI inputs sent next to `state` and `questions`. */
export type CloudflareEvaluateProviderOptions = Record<string, unknown>

/** TypeSafe-shaped Workers AI evaluate output. */
interface CloudflareEvaluateOutput {
  model: string
  answers: Record<string, WireAnswer>
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

/**
 * Cloudflare evaluate adapter. Runs TypeSafe Jev (`typesafe/jev`) through
 * Workers AI (`{ state, questions }` in, `{ state: 'Completed', result:
 * { model, answers, usage } }` out) through the binding or the REST API.
 */
export class CloudflareEvaluateAdapter<
  TModel extends CloudflareEvaluateModel,
> extends BaseEvaluateAdapter<TModel, CloudflareEvaluateProviderOptions> {
  readonly name = 'cloudflare' as const

  private readonly cfConfig: CloudflareConfig
  readonly defaultModelOptions: CloudflareEvaluateProviderOptions | undefined

  constructor(
    {
      defaultModelOptions,
      ...cfConfig
    }: CloudflareAdapterConfig<
      CloudflareConfig,
      CloudflareEvaluateProviderOptions
    >,
    model: TModel,
  ) {
    super({}, model)
    this.cfConfig = cfConfig
    this.defaultModelOptions = defaultModelOptions
  }

  async evaluate(options: EvaluateOptions<CloudflareEvaluateProviderOptions>) {
    const { model, state, questions, modelOptions, abortSignal, logger } =
      options
    try {
      logger.request(`activity=evaluate provider=${this.name} model=${model}`, {
        provider: this.name,
        model,
      })
      // Workers AI wraps third-party model output in `{ state, result }`.
      const { result: output } = (await runModel(
        this.cfConfig,
        model,
        { ...modelOptions, state, questions },
        { signal: abortSignal },
      )) as { result: CloudflareEvaluateOutput }
      const inputTokens = output.usage.input_tokens
      const outputTokens = output.usage.output_tokens
      return {
        model: output.model,
        answers: output.answers,
        usage: buildBaseUsage({
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
        }),
      }
    } catch (error: unknown) {
      logger.errors(`${this.name}.evaluate fatal`, {
        error: toRunErrorPayload(error, `${this.name}.evaluate failed`),
        source: `${this.name}.evaluate`,
      })
      throw error
    }
  }
}

/**
 * Creates a Cloudflare evaluate adapter with explicit configuration.
 *
 * @example
 * ```typescript
 * // Inside a Worker
 * const adapter = createCloudflareDecider('typesafe/jev', { binding: env.AI })
 * // Anywhere, over REST
 * const adapter = createCloudflareDecider('typesafe/jev', { accountId, apiKey })
 * ```
 */
export function createCloudflareDecider<TModel extends CloudflareEvaluateModel>(
  model: TModel,
  config: CloudflareAdapterConfig<
    CloudflareConfig,
    CloudflareEvaluateProviderOptions
  >,
) {
  return new CloudflareEvaluateAdapter(config, model)
}

/**
 * Creates a Cloudflare evaluate adapter, reading `CLOUDFLARE_ACCOUNT_ID` and
 * `CLOUDFLARE_API_TOKEN` from the environment unless a binding is passed.
 */
export function cloudflareDecider<TModel extends CloudflareEvaluateModel>(
  model: TModel,
  config?: CloudflareAdapterConfig<
    CloudflareConfigInput,
    CloudflareEvaluateProviderOptions
  >,
) {
  return new CloudflareEvaluateAdapter(
    {
      ...resolveConfigFromEnv(config),
      defaultModelOptions: config?.defaultModelOptions,
    },
    model,
  )
}
