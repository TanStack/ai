import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { resolveConfigFromEnv } from '../utils/config'
import { CloudflareTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type {
  CloudflareConfigInput,
  CloudflareTextConfig,
  CloudflareTextRestConfig,
} from '../utils/config'
import type { CloudflareTextModel } from '../utils/models'

export type CloudflareSummarizeModel = CloudflareTextModel

/**
 * Creates a Cloudflare summarize adapter. Summaries run as a chat request
 * against the given model.
 */
export function createCloudflareSummarize<
  TModel extends CloudflareSummarizeModel,
>(
  model: TModel,
  config: CloudflareTextConfig,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<CloudflareTextAdapter<TModel>>
> {
  return new ChatStreamSummarizeAdapter(
    new CloudflareTextAdapter(config, model),
    model,
    'cloudflare',
  )
}

/**
 * Creates a Cloudflare summarize adapter, reading `CLOUDFLARE_ACCOUNT_ID` and
 * `CLOUDFLARE_API_TOKEN` from the environment unless a binding is passed.
 */
export function cloudflareSummarize<TModel extends CloudflareSummarizeModel>(
  model: TModel,
  config?: CloudflareConfigInput<CloudflareTextRestConfig>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<CloudflareTextAdapter<TModel>>
> {
  return createCloudflareSummarize(model, resolveConfigFromEnv(config))
}
