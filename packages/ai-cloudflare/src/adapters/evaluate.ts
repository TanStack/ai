import { BaseEvaluateAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { buildBaseUsage } from '@tanstack/ai'
import { resolveConfigFromEnv } from '../utils/config'
import { runModel } from '../utils/run'
import type { EvaluateOptions, WireAnswer } from '@tanstack/ai/adapters'
import type { CloudflareConfig, CloudflareConfigInput } from '../utils/config'
import type { CloudflareEvaluateModel } from '../utils/models'

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
 * Workers AI (`{ state, questions }` in, `{ model, answers, usage }` out)
 * through the binding or the REST API.
 */
export class CloudflareEvaluateAdapter<
  TModel extends CloudflareEvaluateModel,
> extends BaseEvaluateAdapter<TModel> {
  readonly name = 'cloudflare' as const

  constructor(
    private readonly cfConfig: CloudflareConfig,
    model: TModel,
  ) {
    super({}, model)
  }

  async evaluate(options: EvaluateOptions) {
    const { model, state, questions, abortSignal, logger } = options
    try {
      logger.request(`activity=evaluate provider=${this.name} model=${model}`, {
        provider: this.name,
        model,
      })
      const output = (await runModel(
        this.cfConfig,
        model,
        { state, questions },
        { signal: abortSignal },
      )) as CloudflareEvaluateOutput
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
  config: CloudflareConfig,
) {
  return new CloudflareEvaluateAdapter(config, model)
}

/**
 * Creates a Cloudflare evaluate adapter, reading `CLOUDFLARE_ACCOUNT_ID` and
 * `CLOUDFLARE_API_TOKEN` from the environment unless a binding is passed.
 */
export function cloudflareDecider<TModel extends CloudflareEvaluateModel>(
  model: TModel,
  config?: CloudflareConfigInput,
) {
  return new CloudflareEvaluateAdapter(resolveConfigFromEnv(config), model)
}
