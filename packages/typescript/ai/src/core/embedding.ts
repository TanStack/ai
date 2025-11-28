import { aiEventClient } from '../event-client.js'
import type {
  AIAdapter,
  EmbeddingOptions,
  EmbeddingResult,
  ExtractModelsFromAdapter,
} from '../types'

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Standalone embedding function with type inference from adapter
 */
export async function embedding<
  TAdapter extends AIAdapter<any, any, any, any, any>,
>(
  options: Omit<EmbeddingOptions, 'model'> & {
    adapter: TAdapter
    model: ExtractModelsFromAdapter<TAdapter>
  },
): Promise<EmbeddingResult> {
  const { adapter, model, ...restOptions } = options
  const requestId = createId('embedding')
  const inputCount = Array.isArray(restOptions.input)
    ? restOptions.input.length
    : 1
  const startTime = Date.now()

  aiEventClient.emit('embedding:started', {
    requestId,
    model: model as string,
    inputCount,
    timestamp: startTime,
  })

  const result = await adapter.createEmbeddings({
    ...restOptions,
    model: model as string,
  })

  const duration = Date.now() - startTime

  aiEventClient.emit('embedding:completed', {
    requestId,
    model: model as string,
    inputCount,
    duration,
    timestamp: Date.now(),
  })

  return result
}
