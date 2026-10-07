/**
 * @module @tanstack/ai-ollaya
 *
 * Ollaya provider adapter for TanStack AI. Provides a tree-shakeable evaluate
 * adapter for a local Ollaya server's `POST /v1/systemone` decision API using
 * plain fetch — no SDK dependency. Ollaya serves the open-source `laya`
 * decision models.
 */

export { OllayaEvaluateAdapter, ollayaDecider } from './adapters/evaluate'

export { type OllayaClientConfig } from './utils/client'

export { OLLAYA_EVALUATE_MODELS, type OllayaEvaluateModel } from './model-meta'
