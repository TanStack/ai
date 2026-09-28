/**
 * @module @tanstack/ai-ollaya
 *
 * Ollaya provider adapter for TanStack AI. Provides a tree-shakeable evaluate
 * adapter for a local Ollaya server's `POST /v1/systemone` decision API using
 * plain fetch — no SDK dependency. Ollaya serves the open-source `laya`
 * decision models.
 */

export { OllayaEvaluateAdapter, ollayaDecider } from './adapters/evaluate'

export {
  OLLAYA_DEFAULT_BASE_URL,
  resolveOllayaTransport,
  type OllayaClientConfig,
} from './utils/client'

export { OLLAYA_EVALUATE_MODELS, type OllayaEvaluateModel } from './model-meta'
