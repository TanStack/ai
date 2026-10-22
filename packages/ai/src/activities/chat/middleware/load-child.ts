import { createCapability } from './capabilities'
import type { ModelMessage, UIMessage } from '../../../types'

/**
 * Loads the stored transcript of a finished subagent run by its
 * `subagentRunId`. Returns `undefined` for an unknown id. A persistence
 * middleware provides it. The agent tools read it to continue a
 * child by `sessionId`. When `agent` is set, only that agent can continue
 * the child. A middleware that provides it must list `LoadChildCapability`
 * in `provides`. Only then do the agent tools take `sessionId`.
 */
export type LoadChild = (subagentRunId: string) => Promise<
  | {
      messages: Array<ModelMessage | UIMessage>
      /** The name of the agent the child ran under. */
      agent?: string
      /**
       * While the child waits on an interrupt: the stored messages of the call
       * that waits. A resume of that child continues from these, not from the
       * messages on the card that the client sent back. Without it, the agent
       * tool does not resume the child.
       */
      pending?: Array<ModelMessage | UIMessage>
    }
  | undefined
>

export const LoadChildCapability = createCapability<LoadChild>()('load-child')

export const [getLoadChild, provideLoadChild] = LoadChildCapability
