/**
 * @module @tanstack/ai-typesafe
 *
 * TypeSafe provider adapter for TanStack AI.
 * Provides a tree-shakeable evaluate adapter for TypeSafe's
 * `POST /v1/systemone` Jev API using plain fetch — no SDK dependency.
 */

export {
  TypesafeEvaluateAdapter,
  createTypesafeDecider,
  typesafeDecider,
} from './adapters/evaluate'

export {
  getTypesafeApiKeyFromEnv,
  type TypesafeClientConfig,
} from './utils/client'

export {
  TYPESAFE_EVALUATE_MODELS,
  type TypesafeEvaluateModel,
} from './model-meta'
