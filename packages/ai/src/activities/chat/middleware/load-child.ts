import { createCapability } from './capabilities'
import type { ModelMessage, UIMessage } from '../../../types'

/**
 * Loads the stored transcript of a finished subagent run by its
 * `subagentRunId`. Returns `undefined` for an unknown id. A persistence
 * middleware provides it. The agent tools read it to continue a
 * child by `sessionId`. When `agent` is set, only that agent can continue
 * the child. A middleware that provides it must list `LoadChildCapability`
 * in `provides`. Only then do the agent tools take `sessionId`.
 *
 * With `parentSubagentRunId`, it loads a nested child: a child that the child
 * `parentSubagentRunId` started. It returns `undefined` when that child did
 * not start it. A loader that ignores the option fails closed for nested
 * children.
 */
export type LoadChild = (
  subagentRunId: string,
  options?: { parentSubagentRunId?: string },
) => Promise<
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
      /** While the child waits: the ids of the interrupts it waits on. */
      interruptIds?: Array<string>
      /** The tool call of the parent that started the child, if any. */
      parentToolCallId?: string
    }
  | undefined
>

export const LoadChildCapability = createCapability<LoadChild>()('load-child')

export const [getLoadChild, provideLoadChild] = LoadChildCapability
