import OpenAI from 'openai'
import type { Modality, ReasoningLevel } from '@tanstack/ai'
import {
  OpenAICompatibleChatAdapter,
  OpenAICompatibleResponsesAdapter,
} from './adapter'
import type {
  CompatibleModelInput,
  ModelNameOf,
  OpenAICompatibleConfig,
  OpenAICompatibleTextConfig,
  ResolveCompatInput,
  ResolveCompatOptions,
  ResolveCompatReasoning,
  ResolveCompatTools,
} from './types'
import type { CompatibleModelConfig } from './adapter'

export {
  OpenAICompatibleChatAdapter,
  OpenAICompatibleResponsesAdapter,
} from './adapter'
export type {
  CompatibleApi,
  CompatibleModelEntry,
  CompatibleModelInput,
  LevelsOfMap,
  ModelNameOf,
  OpenAICompatibleConfig,
  OpenAICompatibleTextConfig,
} from './types'
export type {
  OpenAICompatibleCompat,
  OpenAICompatibleThinkingFormat,
} from './quirks'

/** One model's reasoning and quirks: its `models` entry over the provider's `compat`. */
function modelConfig(
  models: ReadonlyArray<CompatibleModelInput>,
  model: string,
  compat: OpenAICompatibleConfig<ReadonlyArray<CompatibleModelInput>>['compat'],
): CompatibleModelConfig {
  const entry = models.find(
    (item) => typeof item !== 'string' && item.name === model,
  )
  const own =
    typeof entry === 'object' && 'reasoning' in entry ? entry : undefined
  const ownCompat =
    typeof entry === 'object' && 'compat' in entry ? entry.compat : undefined
  const merged = compat || ownCompat ? { ...compat, ...ownCompat } : undefined
  return {
    ...(typeof entry === 'object' &&
    'input' in entry &&
    entry.input !== undefined
      ? { input: entry.input }
      : {}),
    ...(own?.reasoning !== undefined ? { reasoning: own.reasoning } : {}),
    ...(merged ? { compat: merged } : {}),
  }
}

const DEFAULT_NAME = 'openai-compatible'

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
    compat,
    ...clientOptions
  } = config
  const client = new OpenAI(clientOptions)

  return <TModelName extends ModelNameOf<TModels>>(model: TModelName) => {
    if (api === 'responses') {
      return new OpenAICompatibleResponsesAdapter<
        TModelName,
        ResolveCompatOptions<TModels, TModelName>,
        ResolveCompatInput<TModels, TModelName>,
        ResolveCompatTools<TModels, TModelName>
      >(
        client,
        model,
        name,
        { strictFallbackWarning, fetch: clientOptions.fetch },
        modelConfig(models, model, compat),
      )
    }
    return new OpenAICompatibleChatAdapter<
      TModelName,
      ResolveCompatOptions<TModels, TModelName>,
      ResolveCompatInput<TModels, TModelName>,
      ResolveCompatTools<TModels, TModelName>,
      ResolveCompatReasoning<TModels, TModelName>
    >(
      client,
      model,
      name,
      { strictFallbackWarning, fetch: clientOptions.fetch },
      modelConfig(models, model, compat),
    )
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
export function openaiCompatibleText<const TModelName extends string>(
  model: TModelName,
  config: OpenAICompatibleTextConfig,
) {
  const {
    name = DEFAULT_NAME,
    api = 'chat-completions',
    strictFallbackWarning,
    compat,
    reasoning,
    ...clientOptions
  } = config
  const client = new OpenAI(clientOptions)
  if (api === 'responses') {
    return new OpenAICompatibleResponsesAdapter<TModelName>(
      client,
      model,
      name,
      { strictFallbackWarning, fetch: clientOptions.fetch },
      compat ? { compat } : {},
    )
  }
  return new OpenAICompatibleChatAdapter<
    TModelName,
    Record<string, any>,
    ReadonlyArray<Modality>,
    ReadonlyArray<string>,
    { levels: Exclude<ReasoningLevel, 'xhigh' | 'max'>; budget: false }
  >(
    client,
    model,
    name,
    { strictFallbackWarning, fetch: clientOptions.fetch },
    {
      ...(reasoning !== undefined ? { reasoning } : {}),
      ...(compat ? { compat } : {}),
    },
  )
}
