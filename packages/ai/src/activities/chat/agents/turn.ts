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
 * The subagent cards in `messages`: UI subagent parts, then wire groups.
 * Nested cards stay inside their parent card.
 */
export function subagentCards(messages: ReadonlyArray<AnyMessage>): Array<
  Omit<SubagentTurnChild, 'resume'> & {
    /** The interrupt ids of the child and its nested children. */
    ids: Set<string>
    plan: unknown
  }
> {
  const parts = messages.flatMap((message) =>
    'parts' in message
      ? message.parts.filter((part) => part.type === 'subagent')
      : [],
  )
  return [
    ...parts.map(({ subagent }) => ({
      subagentRunId: subagent.id,
      name: subagent.name,
      status: subagent.status,
      ...(subagent.parentToolCallId !== undefined && {
        parentToolCallId: subagent.parentToolCallId,
      }),
      messages: subagent.messages,
      text: uiText(subagent.messages),
      ids: new Set(partInterruptIds({ type: 'subagent', subagent })),
      plan: planOf(subagent.metadata),
    })),
    ...splitSubagentWire(messages).groups.map((group) => ({
      subagentRunId: group.id,
      name: group.info.name,
      status: group.info.status,
      ...(group.info.parentToolCallId !== undefined && {
        parentToolCallId: group.info.parentToolCallId,
      }),
      messages: group.messages,
      text: subagentWireText(group.messages),
      ids: new Set(groupInterruptIds(group)),
      plan: planOf(group.info.metadata),
    })),
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
  const found = subagentCards(messages.slice(lastUser + 1))
  const plan = found.find((card) => card.plan !== undefined)?.plan

  const owned = new Set<string>()
  const children = found.map(({ ids, plan: _plan, ...child }) => {
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
