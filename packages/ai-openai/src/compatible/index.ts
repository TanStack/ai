import { createOpenAIClient } from '@tanstack/openai-base'
import {
  OpenAICompatibleChatAdapter,
  OpenAICompatibleResponsesAdapter,
} from './adapter'
import type { Modality, ReasoningCapability } from '@tanstack/ai'
import type { OpenAIBaseTextAdapterOptions } from '@tanstack/openai-base'
import type { ClientOptions } from 'openai'
import type { OptionsArg } from './adapter'
import type {
  CompatibleModelInput,
  CompatibleReasoning,
  ModelNameOf,
  OpenAICompatibleConfig,
  OpenAICompatibleTextConfig,
  ReasoningOf,
  ResolveCompatInput,
  ResolveCompatOptions,
  ResolveCompatReasoning,
  ResolveCompatTools,
} from './types'

export {
  OpenAICompatibleChatAdapter,
  OpenAICompatibleResponsesAdapter,
  type OpenAICompatibleAdapterOptions,
} from './adapter'
export type {
  CompatibleApi,
  CompatibleModelInput,
  ModelNameOf,
  OpenAICompatibleConfig,
  OpenAICompatibleTextConfig,
} from './types'

const DEFAULT_NAME = 'openai-compatible'

/**
 * The options argument of an adapter that a factory makes.
 * ponytail: the cast is safe because the levels and `TReasoning` come from the
 * same value (the `createModel` def or the `reasoning` config). TypeScript
 * cannot follow that link through the generic factory.
 */
function optionsArg<TReasoning extends ReasoningCapability>(
  options: OpenAIBaseTextAdapterOptions & Pick<ClientOptions, 'fetch'>,
  reasoning: CompatibleReasoning | undefined,
) {
  return [{ ...options, reasoning }] as OptionsArg<TReasoning>
}

/**
 * Configure an OpenAI-compatible provider once, then select a model per call.
 *
 * @example
 * ```ts
 * const deepseek = openaiCompatible({
 *   name: 'deepseek',
 *   baseURL: 'https://api.deepseek.com/v1',
 *   apiKey: process.env.DEEPSEEK_KEY!,
 *   models: ['deepseek-chat', 'deepseek-reasoner'],
 * })
 * chat({ adapter: deepseek('deepseek-chat'), messages })
 * ```
 */
export function openaiCompatible<
  const TModels extends ReadonlyArray<CompatibleModelInput>,
>(config: OpenAICompatibleConfig<TModels>) {
  // `name`, `models`, and `api` are TanStack-level config; everything else
  // (incl. the required `apiKey` / `baseURL`) is OpenAI SDK ClientOptions.
  const {
    name = DEFAULT_NAME,
    models,
    api = 'chat-completions',
    strictFallbackWarning,
    ...clientOptions
  } = config
  const client = createOpenAIClient(clientOptions)

  return <TModelName extends ModelNameOf<TModels>>(model: TModelName) => {
    const def = models.find(
      (entry) => typeof entry !== 'string' && entry.name === model,
    )
    const options = optionsArg<ResolveCompatReasoning<TModels, TModelName>>(
      { strictFallbackWarning, fetch: clientOptions.fetch },
      typeof def === 'string' ? undefined : def?.reasoning,
    )
    if (api === 'responses') {
      return new OpenAICompatibleResponsesAdapter<
        TModelName,
        ResolveCompatOptions<TModels, TModelName>,
        ResolveCompatInput<TModels, TModelName>,
        ResolveCompatTools<TModels, TModelName>,
        ResolveCompatReasoning<TModels, TModelName>
      >(client, model, name, ...options)
    }
    return new OpenAICompatibleChatAdapter<
      TModelName,
      ResolveCompatOptions<TModels, TModelName>,
      ResolveCompatInput<TModels, TModelName>,
      ResolveCompatTools<TModels, TModelName>,
      ResolveCompatReasoning<TModels, TModelName>
    >(client, model, name, ...options)
  }
}

/**
 * One-shot helper: build a single-model OpenAI-compatible adapter inline.
 *
 * @example
 * ```ts
 * chat({
 *   adapter: openaiCompatibleText('deepseek-chat', {
 *     baseURL: 'https://api.deepseek.com/v1',
 *     apiKey: process.env.DEEPSEEK_KEY!,
 *   }),
 *   messages,
 * })
 * ```
 */
export function openaiCompatibleText<
  const TModelName extends string,
  const TReasoning extends CompatibleReasoning | undefined = undefined,
>(model: TModelName, config: OpenAICompatibleTextConfig<TReasoning>) {
  const {
    name = DEFAULT_NAME,
    api = 'chat-completions',
    strictFallbackWarning,
    reasoning,
    ...clientOptions
  } = config
  const client = createOpenAIClient(clientOptions)
  const options = optionsArg<ReasoningOf<TReasoning>>(
    { strictFallbackWarning, fetch: clientOptions.fetch },
    reasoning,
  )
  if (api === 'responses') {
    return new OpenAICompatibleResponsesAdapter<
      TModelName,
      Record<string, any>,
      ReadonlyArray<Modality>,
      ReadonlyArray<string>,
      ReasoningOf<TReasoning>
    >(client, model, name, ...options)
  }
  return new OpenAICompatibleChatAdapter<
    TModelName,
    Record<string, any>,
    ReadonlyArray<Modality>,
    ReadonlyArray<string>,
    ReasoningOf<TReasoning>
  >(client, model, name, ...options)
}
