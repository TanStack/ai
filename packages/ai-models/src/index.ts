import { generatedAt, providerModules } from './catalog'
import type { ModelRecord, ProviderRecord } from './types'

export { generatedAt }
export {
  clampReasoningLevel,
  modelReasoning,
  supportedReasoningLevels,
} from './reasoning'
export { modelCost } from './cost'
export type {
  Cost,
  InputModality,
  ModelCompat,
  ModelCostRates,
  ModelCostTier,
  ModelReasoning,
  ModelRecord,
  ProviderRecord,
  ReasoningLevel,
  ReasoningMap,
  ThinkingFormat,
  TokenCounts,
  WireApi,
} from './types'

/** Every provider, in id order. */
export function getProviders(): ReadonlyArray<ProviderRecord> {
  return providerModules.map((module) => module.provider)
}

/** Every model of a provider, sorted by id. Empty for an unknown provider. */
export function getModels(providerId: string): ReadonlyArray<ModelRecord> {
  return (
    providerModules.find((module) => module.provider.id === providerId)
      ?.models ?? []
  )
}

/** One model, or `undefined` when the catalog does not have it. */
export function getModel(
  providerId: string,
  modelId: string,
): ModelRecord | undefined {
  return getModels(providerId).find((model) => model.id === modelId)
}
