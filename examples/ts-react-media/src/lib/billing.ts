import type { BilledUsage, StreamChunk } from '@tanstack/ai'

/**
 * Billing figures a finished video job reports. `VideoGenerateResult` — what
 * `useGenerateVideo` hands back as its result — carries only the job id, url
 * and expiry, so these are read off the terminal `generation:result` chunk
 * through the hook's `onChunk` instead.
 */
export interface VideoBilling {
  /** Billed quantity paired with the unit it is denominated in. */
  billed?: BilledUsage
  /** Provider-reported cost in USD, for providers that report one. */
  cost?: number
  /** Token total, for providers that bill media generation as tokens. */
  totalTokens?: number
}

function numberField(source: object, key: string): number | undefined {
  const value: unknown = Reflect.get(source, key)
  return typeof value === 'number' ? value : undefined
}

/** Reads `usage.billed` when it carries the `{ quantity, unit }` pair. */
function billedField(source: object): BilledUsage | undefined {
  const value: unknown = Reflect.get(source, 'billed')
  if (typeof value !== 'object' || value === null) return undefined
  const quantity: unknown = Reflect.get(value, 'quantity')
  const unit: unknown = Reflect.get(value, 'unit')
  if (typeof quantity !== 'number' || typeof unit !== 'string') {
    return undefined
  }
  return { quantity, unit }
}

/**
 * Reads the usage block off a generation's terminal result chunk, or
 * `undefined` for every other chunk (and for providers that report no usage).
 */
export function readVideoBilling(chunk: StreamChunk): VideoBilling | undefined {
  if (chunk.type !== 'CUSTOM' || chunk.name !== 'generation:result') {
    return undefined
  }
  const value: unknown = chunk.value
  if (typeof value !== 'object' || value === null) return undefined
  const usage: unknown = Reflect.get(value, 'usage')
  if (typeof usage !== 'object' || usage === null) return undefined

  const billed = billedField(usage)
  const cost = numberField(usage, 'cost')
  const totalTokens = numberField(usage, 'totalTokens')
  if (billed === undefined && cost === undefined && totalTokens === undefined) {
    return undefined
  }
  return {
    ...(billed !== undefined && { billed }),
    ...(cost !== undefined && { cost }),
    ...(totalTokens !== undefined && { totalTokens }),
  }
}
