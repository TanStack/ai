import { aiEventClient } from '../../event-client'
import { createId } from '../utils/id'
import type { EmbedResult } from '../../types'
import type { EmbeddingAdapter, kind } from './adapter'

export interface EmbedActivityOptions<
  TAdapter extends EmbeddingAdapter<string, object>,
> {
  /** The embedding adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** The value to convert to embedding */
  value: string
  /** Model-specific options for embedding */
  modelOptions?: TAdapter['~types']['providerOptions']
}

/** Result type for the embed activity */
export type EmbedActivityResult = Promise<EmbedResult>

export async function embed<TAdapter extends EmbeddingAdapter<string, object>>(
  options: EmbedActivityOptions<TAdapter>,
): EmbedActivityResult {
  const { adapter, ...rest } = options
  const model = adapter.model
  const requestId = createId('embed')
  const startTime = Date.now()

  aiEventClient.emit('embed:request:started', {
    requestId,
    provider: adapter.name,
    model,
    value: rest.value,
    modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
    timestamp: startTime,
  })

  const result = await adapter.embed({ ...rest, model })
  const duration = Date.now() - startTime

  aiEventClient.emit('embed:request:completed', {
    requestId,
    provider: adapter.name,
    model,
    embedding: result.embedding,
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
