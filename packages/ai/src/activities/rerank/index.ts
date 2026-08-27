import { aiEventClient } from '@tanstack/ai-event-client'
import { resolveDebugOption } from '../../logger/resolve'
import { isAbortShapedError } from '../error-payload'
import {
  createGenerationContext,
  runGenerationAbort,
  runGenerationError,
  runGenerationFinish,
  runGenerationStart,
  runGenerationUsage,
} from '../middleware/run'
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type { GenerationMiddleware } from '../middleware/types'
import type { RerankAdapter } from './adapter'
import type { RerankResult } from '../../types'

/** The adapter kind this activity handles */
export const kind = 'rerank' as const

/** Extract provider options from a RerankAdapter via ~types */
export type RerankProviderOptions<TAdapter> = TAdapter extends {
  '~types': { providerOptions: infer P extends object }
}
  ? P
  : object

export interface RerankActivityOptions<
  TAdapter extends RerankAdapter<string, RerankProviderOptions<TAdapter>>,
  TDocument extends string | object = string,
> {
  /** The rerank adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** The query documents are scored against. */
  query: string
  documents: Array<TDocument>
  /** Return only the top N results. */
  topN?: number
  /** Provider-specific options */
  modelOptions?: RerankProviderOptions<TAdapter>
  /** Forwarded to the provider request for cancellation. */
  abortSignal?: AbortSignal
  middleware?: Array<GenerationMiddleware>
  debug?: DebugOption
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Serialize a document for the provider. Strings pass through untouched. */
function serializeDocument(document: string | object): string {
  return typeof document === 'string' ? document : JSON.stringify(document)
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (isAbortShapedError(error)) return true
  // Fall back to signal state only for non-Error throws we can't otherwise
  // identify; a real Error with a non-abort name is never an abort.
  return error instanceof Error ? false : signal?.aborted === true
}

export async function rerank<
  TAdapter extends RerankAdapter<string, RerankProviderOptions<TAdapter>>,
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

    const ranking = result.ranking.map((r) => {
      const document = documents[r.index]
      if (document === undefined) {
        throw new Error(
          `rerank(): provider ${adapter.name} returned out-of-range index ${r.index}`,
        )
      }
      return { index: r.index, score: r.score, document }
    })
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

export function createRerankOptions<
  TAdapter extends RerankAdapter<string, RerankProviderOptions<TAdapter>>,
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
