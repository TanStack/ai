import type { OptimizationEvent } from './types'

/** The log record type of a run's context projections (observability). */
export const OPTIMIZE_RECORD_TYPE = 'tanstack.optimize'

/**
 * One durable summary of a run's projections and retrievals, as a host log
 * record. Unlike `tanstack.compaction`, it is NOT folded back into the model
 * context: projection is a pure function of the canonical messages, so the
 * projected history rebuilds identically on its own. This record exists purely
 * to feed the dashboard's spend story. A type (not an interface) so it fits the
 * record shape of `LogRecordsWriter.append`.
 */
export type OptimizeRecord = {
  type: typeof OPTIMIZE_RECORD_TYPE
  projections: Array<{
    toolName: string
    toolCallId: string
    fieldPath: string
    strategy: string
    /** Estimates — reported with a `~` by consumers. */
    originalTokens: number
    keptTokens: number
    ref?: string
  }>
  retrievals: Array<{
    toolName: string
    toolCallId: string
    fieldPath: string
    ref: string
  }>
}

export function optimizeRecord(
  events: ReadonlyArray<OptimizationEvent>,
): OptimizeRecord {
  const projections: OptimizeRecord['projections'] = []
  const retrievals: OptimizeRecord['retrievals'] = []
  for (const e of events) {
    if (e.type === 'projected') {
      projections.push({
        toolName: e.toolName,
        toolCallId: e.toolCallId,
        fieldPath: e.fieldPath,
        strategy: e.strategy,
        originalTokens: e.originalTokens,
        keptTokens: e.keptTokens,
        ...(e.ref ? { ref: e.ref } : {}),
      })
    } else {
      retrievals.push({
        toolName: e.toolName,
        toolCallId: e.toolCallId,
        fieldPath: e.fieldPath,
        ref: e.ref,
      })
    }
  }
  return { type: OPTIMIZE_RECORD_TYPE, projections, retrievals }
}
