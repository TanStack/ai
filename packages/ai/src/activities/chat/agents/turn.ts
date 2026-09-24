import {
  splitSubagentWire,
  subagentWireText,
  wireSubagentRunId,
} from '../../../utilities/subagent-wire'
import type { SubagentWireGroup } from '../../../utilities/subagent-wire'
import type {
  ModelMessage,
  RunAgentResumeItem,
  SubagentPart,
  SubagentStatus,
  UIMessage,
} from '../../../types'

type AnyMessage = UIMessage | ModelMessage

export interface SubagentTurnChild {
  subagentRunId: string
  name: string
  status: SubagentStatus
  parentToolCallId?: string
  /** The child's own messages from the earlier run. */
  messages: Array<AnyMessage>
  /** Text the child wrote. */
  text: string
  /** Resume entries for this child and its nested children. */
  resume: Array<RunAgentResumeItem>
}

/** The interrupted turn that a resume continues. */
export interface SubagentTurn {
  /**
   * Messages up to and including the last top-level user message. Child wire
   * messages do not count.
   */
  before: Array<AnyMessage>
  /** Direct children of the parent in that turn. */
  children: Array<SubagentTurnChild>
  /** Resume entries that no child owns. They belong to the parent run. */
  rest: Array<RunAgentResumeItem>
  /** The router plan of the earlier run, from the children's metadata. */
  plan?: unknown
}

/** Key of the router plan in `SUBAGENT_STARTED` metadata (`metadata.tanstack`). */
export const SUBAGENT_PLAN_KEY = 'subagentPlan'

function planOf(metadata: Record<string, unknown> | undefined): unknown {
  const tanstack = metadata?.tanstack
  if (typeof tanstack !== 'object' || tanstack === null) return undefined
  return (tanstack as Record<string, unknown>)[SUBAGENT_PLAN_KEY]
}

function uiText(messages: ReadonlyArray<UIMessage>) {
  return messages
    .flatMap((message) =>
      message.role === 'assistant'
        ? message.parts.flatMap((part) =>
            part.type === 'text' && part.content.trim() !== ''
              ? [part.content.trim()]
              : [],
          )
        : [],
    )
    .join('\n\n')
}

function partInterruptIds(part: SubagentPart): Array<string> {
  return [
    ...(part.subagent.interruptIds ?? []),
    ...part.subagent.messages.flatMap((message) =>
      message.parts.flatMap((nested) =>
        nested.type === 'subagent' ? partInterruptIds(nested) : [],
      ),
    ),
  ]
}

function groupInterruptIds(group: SubagentWireGroup<unknown>): Array<string> {
  return [
    ...(group.info.interruptIds ?? []),
    ...splitSubagentWire(group.messages).groups.flatMap(groupInterruptIds),
  ]
}

/**
 * Find the children of the trailing assistant turn that `resume` answers.
 * Returns undefined when no child owns a resume entry.
 */
export function readSubagentTurn(
  messages: ReadonlyArray<AnyMessage>,
  resume: ReadonlyArray<RunAgentResumeItem> | undefined,
): SubagentTurn | undefined {
  if (!resume || resume.length === 0) return undefined
  const lastUser = messages.findLastIndex(
    (message) =>
      message.role === 'user' && wireSubagentRunId(message) === undefined,
  )
  const before = messages.slice(0, lastUser + 1)
  const turn = messages.slice(lastUser + 1)

  const found: Array<Omit<SubagentTurnChild, 'resume'> & { ids: Set<string> }> =
    []
  let plan: unknown
  for (const message of turn) {
    if (!('parts' in message)) continue
    for (const part of message.parts) {
      if (part.type !== 'subagent') continue
      plan ??= planOf(part.subagent.metadata)
      found.push({
        subagentRunId: part.subagent.id,
        name: part.subagent.name,
        status: part.subagent.status,
        ...(part.subagent.parentToolCallId !== undefined && {
          parentToolCallId: part.subagent.parentToolCallId,
        }),
        messages: part.subagent.messages,
        text: uiText(part.subagent.messages),
        ids: new Set(partInterruptIds(part)),
      })
    }
  }
  for (const group of splitSubagentWire(turn).groups) {
    plan ??= planOf(group.info.metadata)
    found.push({
      subagentRunId: group.id,
      name: group.info.name,
      status: group.info.status,
      ...(group.info.parentToolCallId !== undefined && {
        parentToolCallId: group.info.parentToolCallId,
      }),
      messages: group.messages,
      text: subagentWireText(group.messages),
      ids: new Set(groupInterruptIds(group)),
    })
  }

  const owned = new Set<string>()
  const children = found.map(({ ids, ...child }) => {
    const entries = resume.filter((entry) => ids.has(entry.interruptId))
    for (const entry of entries) owned.add(entry.interruptId)
    return { ...child, resume: entries }
  })
  if (owned.size === 0) return undefined
  return {
    before,
    children,
    rest: resume.filter((entry) => !owned.has(entry.interruptId)),
    ...(plan !== undefined && { plan }),
  }
}
