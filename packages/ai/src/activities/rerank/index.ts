/**
 * Rerank Activity
 *
 * Reorders a set of documents by semantic relevance to a query.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import { aiEventClient } from '@tanstack/ai-event-client'
import { resolveDebugOption } from '../../logger/resolve'
import {
  createGenerationContext,
  runGenerationAbort,
  runGenerationError,
  runGenerationFinish,
  runGenerationStart,
  runGenerationUsage,
} from '../middleware'
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type { GenerationMiddleware } from '../middleware'
import type { RerankAdapter } from './adapter'
import type { RerankResult } from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'rerank' as const

// ===========================
// Type Extraction Helpers
// ===========================

/** Extract provider options from a RerankAdapter via ~types */
export type RerankProviderOptions<TAdapter> =
  TAdapter extends RerankAdapter<any, any>
    ? TAdapter['~types']['providerOptions']
    : object

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the rerank activity. The model is extracted from the adapter's
 * model property.
 *
 * @template TAdapter - The rerank adapter type
 * @template TDocument - The document element type (string or object)
 */
export interface RerankActivityOptions<
  TAdapter extends RerankAdapter<string, object>,
  TDocument extends string | object = string,
> {
  /** The rerank adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** The query documents are scored against. */
  query: string
  /**
   * Documents to rerank. Either strings or JSON-serializable objects — object
   * documents are serialized with `JSON.stringify` before being sent to the
   * provider, and the original element (string or object) is returned in the
   * result, preserving its type.
   */
  documents: Array<TDocument>
  /** Return only the top N results. */
  topN?: number
  /** Provider-specific options */
  modelOptions?: RerankProviderOptions<TAdapter>
  /** Forwarded to the provider request for cancellation. */
  abortSignal?: AbortSignal
  /**
   * Observe-only middleware notified on start, usage, success, abort, and
   * error. Pass `otelMiddleware()` to emit OpenTelemetry spans, or implement
   * the `GenerationMiddleware` contract for a custom backend.
   */
  middleware?: Array<GenerationMiddleware>
  /**
   * Enable debug logging. Pass `true` to enable all categories, `false` to
   * silence everything including errors, or a `DebugConfig` object for granular
   * control and/or a custom `Logger`.
   */
  debug?: DebugOption
}

// ===========================
// Helper Functions
// ===========================

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Serialize a document for the provider. Strings pass through untouched. */
function serializeDocument(document: string | object): string {
  return typeof document === 'string' ? document : JSON.stringify(document)
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

// ===========================
// Activity Implementation
// ===========================

/**
 * Rerank activity - reorders documents by relevance to a query.
 *
 * @example Basic reranking
 * ```ts
 * import { rerank } from '@tanstack/ai'
 * import { cohereRerank } from '@tanstack/ai-cohere'
 *
 * const { ranking, rerankedDocuments } = await rerank({
 *   adapter: cohereRerank('rerank-v3.5'),
 *   query: 'talk about rain',
 *   documents: ['sunny day at the beach', 'rainy afternoon in the city'],
 *   topN: 2,
 * })
 *
 * console.log(rerankedDocuments[0]) // 'rainy afternoon in the city'
 * ```
 *
 * @example Reranking object documents
 * ```ts
 * const { ranking } = await rerank({
 *   adapter: cohereRerank('rerank-v3.5'),
 *   query: 'best laptop for travel',
 *   documents: [
 *     { id: 1, text: 'A heavy gaming desktop' },
 *     { id: 2, text: 'A lightweight ultrabook with all-day battery' },
 *   ],
 * })
 *
 * // ranking[0].document is the original object, fully typed.
 * console.log(ranking[0].document.id)
 * ```
 */
export async function rerank<
  TAdapter extends RerankAdapter<string, object>,
  TDocument extends string | object = string,
>(
  options: RerankActivityOptions<TAdapter, TDocument>,
): Promise<RerankResult<TDocument>> {
  const {
    adapter,
    query,
    documents,
    topN,
    modelOptions,
    abortSignal,
    middleware,
  } = options
  const model = adapter.model
  const requestId = createId('rerank')
  const startTime = Date.now()
  const logger: InternalLogger = resolveDebugOption(options.debug)

  if (documents.length === 0) {
    throw new Error('rerank() requires at least one document')
  }

  const mwCtx = createGenerationContext({
    requestId,
    // `rerank` joins the GenerationActivity union; otel maps it to its own
    // gen_ai.operation.name.
    activity: 'rerank',
    provider: adapter.name,
    model,
    modelOptions,
    createId,
  })

  await runGenerationStart(middleware, mwCtx)

  aiEventClient.emit('rerank:request:started', {
    requestId,
    provider: adapter.name,
    model,
    documentCount: documents.length,
    timestamp: startTime,
  })

  logger.request(`activity=rerank provider=${adapter.name}`, {
    provider: adapter.name,
    model,
    documentCount: documents.length,
  })

  // Serialize once; reuse for the request only. Original documents are mapped
  // back by index below so the caller's element type is preserved.
  const serialized = documents.map(serializeDocument)

  try {
    const result = await adapter.rerank({
      model,
      query,
      documents: serialized,
      topN,
      modelOptions,
      abortSignal,
      logger,
    })

    const ranking = result.ranking.map((r) => ({
      index: r.index,
      score: r.score,
      document: documents[r.index] as TDocument,
    }))
    const rerankedDocuments = ranking.map((r) => r.document)

    const duration = Date.now() - startTime

    aiEventClient.emit('rerank:request:completed', {
      requestId,
      provider: adapter.name,
      model,
      documentCount: documents.length,
      resultCount: ranking.length,
      duration,
      timestamp: Date.now(),
    })

    aiEventClient.emit('rerank:usage', {
      requestId,
      model,
      usage: result.usage,
      timestamp: Date.now(),
    })

    logger.output(`activity=rerank results=${ranking.length}`, {
      resultCount: ranking.length,
    })

    await runGenerationUsage(middleware, mwCtx, result.usage)
    await runGenerationFinish(middleware, mwCtx, {
      duration,
      usage: result.usage,
    })

    return {
      id: result.id,
      model,
      ranking,
      rerankedDocuments,
      usage: result.usage,
    }
  } catch (error) {
    const duration = Date.now() - startTime
    if (isAbortError(error, abortSignal)) {
      await runGenerationAbort(middleware, mwCtx, {
        reason: error instanceof Error ? error.message : undefined,
        duration,
      })
    } else {
      await runGenerationError(middleware, mwCtx, { error, duration })
    }
    logger.errors('rerank activity failed', { error, source: 'rerank' })
    throw error
  }
}

// ===========================
// Options Factory
// ===========================

/**
 * Create typed options for the rerank() function without executing.
 */
export function createRerankOptions<
  TAdapter extends RerankAdapter<string, object>,
  TDocument extends string | object = string,
>(
  options: RerankActivityOptions<TAdapter, TDocument>,
): RerankActivityOptions<TAdapter, TDocument> {
  return options
}

// Re-export adapter types
export type {
  RerankAdapter,
  RerankAdapterConfig,
  AnyRerankAdapter,
} from './adapter'
export { BaseRerankAdapter } from './adapter'
