import { toolDefinition } from '@tanstack/ai'
import type { OptimizationEvent } from './types'
import type { Stash } from './stash'

/** The one generic retrieval tool injected by `optimize()` / the runtime (D4).
 *  Refs are deterministic `ctx_<toolCallId>_<fieldSlug>`. */
export const RETRIEVE_TOOL_NAME = 'retrieve_context'

/**
 * Build the `retrieve_context` tool over a run's stash. Returns the full
 * original field value for a known ref and emits a `retrieved` event. An
 * unknown ref produces a tool error result with a plain message (itself exempt
 * from projection per the errors rule). The result is exempt from projection:
 * the tool is never optimized and is excluded from `optimize()` defaults.
 */
export function createRetrieveTool(
  stash: Stash,
  onEvent?: (e: OptimizationEvent) => void,
) {
  return toolDefinition({
    name: RETRIEVE_TOOL_NAME,
    description:
      'Retrieve the full, untruncated content that was elided from a tool result in the conversation. ' +
      'Pass the ref shown in a "[Truncated for context: …]" or "[Dropped for context: …]" marker.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'The ctx_… ref from a projection marker.',
        },
      },
      required: ['ref'],
      additionalProperties: false,
    },
  }).server(async (args: unknown) => {
    const ref =
      typeof args === 'object' && args !== null
        ? (args as { ref?: unknown }).ref
        : undefined
    const entry = typeof ref === 'string' ? stash.get(ref) : undefined
    if (!entry || typeof ref !== 'string') {
      throw new Error(
        `Unknown context ref "${String(ref)}". It may be from a different run (the stash is run-scoped).`,
      )
    }
    onEvent?.({
      type: 'retrieved',
      toolName: entry.toolName,
      toolCallId: entry.toolCallId,
      fieldPath: entry.fieldPath,
      ref,
    })
    return entry.value
  })
}
