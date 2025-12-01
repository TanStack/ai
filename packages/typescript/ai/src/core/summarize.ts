import { aiEventClient } from '../event-client.js'
import type {
  AIAdapter,
  ExtractModelsFromAdapter,
  SummarizationOptions,
  SummarizationResult,
} from '../types'

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Standalone summarize function with type inference from adapter
 */
export async function summarize<
  TAdapter extends AIAdapter<any, any, any, any, any>,
>(
  options: Omit<SummarizationOptions, 'model'> & {
    adapter: TAdapter
    model: ExtractModelsFromAdapter<TAdapter>
    text: string
  },
): Promise<SummarizationResult> {
  const { adapter, model, text, ...restOptions } = options
  const requestId = createId('summarize')
  const inputLength = text.length
  const startTime = Date.now()

  aiEventClient.emit('summarize:started', {
    requestId,
    model: model as string,
    inputLength,
    timestamp: startTime,
  })

  const result = await adapter.summarize({
    ...restOptions,
    text,
    model: model as string,
  })

  const duration = Date.now() - startTime
  const outputLength = result.summary.length

  aiEventClient.emit('summarize:completed', {
    requestId,
    model: model as string,
    inputLength,
    outputLength,
    duration,
    timestamp: Date.now(),
  })

  return result
}
