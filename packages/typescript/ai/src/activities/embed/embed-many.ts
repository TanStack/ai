import { aiEventClient } from '../../event-client'
import type { EmbeddingAdapter, kind } from './adapter'
import type { EmbedManyResult } from '../../types'

export interface EmbedManyActivityOptions<
  TAdapter extends EmbeddingAdapter<string, object>,
> {
  /** The embedding adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** The value to convert to embedding */
  values: Array<string>
  /** Model-specific options for embedding */
  modelOptions?: TAdapter['~types']['providerOptions']
}

/** Result type for the TTS activity */
export type EmbedManyActivityResult = Promise<EmbedManyResult>

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export async function embedMany<
  TAdapter extends EmbeddingAdapter<string, object>,
>(options: EmbedManyActivityOptions<TAdapter>): EmbedManyActivityResult {
  const { adapter, ...rest } = options
  const model = adapter.model
  const requestId = createId('embed-many')
  const startTime = Date.now()

  aiEventClient.emit('embed-many:request:started', {
    requestId,
    provider: adapter.name,
    model,
    values: rest.values,
    modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
    timestamp: startTime,
  })

  const result = await adapter.embedMany({ ...rest, model })
  const duration = Date.now() - startTime

  aiEventClient.emit('embed-many:request:completed', {
    requestId,
    provider: adapter.name,
    model,
    embeddings: result.embeddings,
    duration,
    modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
    timestamp: Date.now(),
  })

  if (result.usage) {
    aiEventClient.emit('embed:usage', {
      requestId,
      provider: adapter.name,
      model,
      usage: result.usage,
      timestamp: Date.now(),
    })
  }

  return result
}
