import { createCapability } from './capabilities'
import type { ModelMessage, UIMessage } from '../../../types'

/**
 * Loads the stored transcript of a finished subagent run by its
 * `subagentRunId`. Returns `undefined` for an unknown id. A persistence
 * middleware provides it. The single `subagent` tool reads it to continue a
 * child by `sessionId`.
 */
export type LoadChild = (
  subagentRunId: string,
) => Promise<{ messages: Array<ModelMessage | UIMessage> } | undefined>

export const LoadChildCapability = createCapability<LoadChild>()('load-child')

export const [getLoadChild, provideLoadChild] = LoadChildCapability
