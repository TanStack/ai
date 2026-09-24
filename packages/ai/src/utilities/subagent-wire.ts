import type { SubagentInfo as AGUISubagentInfo } from '@ag-ui/core'
import type { SubagentHandleData } from '../types'

/**
 * Card data that travels on each child wire message, in
 * `metadata.tanstack.subagent`. The messages carry the AG-UI `subagentRunId`.
 */
export interface SubagentWireInfo
  extends
    AGUISubagentInfo,
    Pick<
      SubagentHandleData,
      | 'status'
      | 'error'
      | 'interruptIds'
      | 'parentSubagentRunId'
      | 'parentToolCallId'
      | 'metadata'
    > {
  /** The child has no messages yet. This wire message only holds the card. */
  placeholder?: true
}

export interface SubagentWireGroup<T> {
  id: string
  info: SubagentWireInfo
  /** The child's messages without its own tag. Nested children keep theirs. */
  messages: Array<T>
  /** Index in `top` of the last message before this child, or -1. */
  hostIndex: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function wireSubagentRunId(message: unknown): string | undefined {
  if (!isRecord(message) || 'parts' in message) return undefined
  const id = message.subagentRunId
  return typeof id === 'string' && id !== '' ? id : undefined
}

export function wireSubagentInfo(
  message: unknown,
): SubagentWireInfo | undefined {
  if (!isRecord(message) || !isRecord(message.metadata)) return undefined
  const tanstack = message.metadata.tanstack
  if (!isRecord(tanstack) || !isRecord(tanstack.subagent)) return undefined
  // Wire data comes from the client. Keep only well-formed fields.
  const { name, status, error, interruptIds } = tanstack.subagent
  if (typeof name !== 'string' || !isStatus(status)) return undefined
  const {
    description,
    parentSubagentRunId,
    parentToolCallId,
    metadata,
    placeholder,
  } = tanstack.subagent
  return {
    name,
    status,
    ...(typeof description === 'string' && { description }),
    ...(isRecord(error) &&
      typeof error.message === 'string' && {
        error: {
          message: error.message,
          ...(typeof error.code === 'string' && { code: error.code }),
        },
      }),
    ...(Array.isArray(interruptIds) && {
      interruptIds: interruptIds.filter(
        (id): id is string => typeof id === 'string',
      ),
    }),
    ...(typeof parentSubagentRunId === 'string' && { parentSubagentRunId }),
    ...(typeof parentToolCallId === 'string' && { parentToolCallId }),
    ...(isRecord(metadata) && { metadata }),
    ...(placeholder === true && { placeholder: true as const }),
  }
}

function isStatus(value: unknown): value is SubagentWireInfo['status'] {
  return (
    value === 'running' ||
    value === 'finished' ||
    value === 'error' ||
    value === 'suspended'
  )
}

function untag<T>(message: T): T {
  if (!isRecord(message)) return message
  const { subagentRunId: _id, ...rest } = message
  void _id
  const metadata = isRecord(rest.metadata) ? rest.metadata : undefined
  const tanstack = isRecord(metadata?.tanstack) ? metadata.tanstack : undefined
  if (!metadata || !tanstack || !('subagent' in tanstack)) return rest as T
  const { subagent: _info, ...tanstackRest } = tanstack
  void _info
  return { ...rest, metadata: { ...metadata, tanstack: tanstackRest } } as T
}

/**
 * Split wire messages into the parent's own messages and one group per direct
 * child. A nested child's messages stay inside its parent's group.
 */
export function splitSubagentWire<T>(messages: ReadonlyArray<T>): {
  top: Array<T>
  groups: Array<SubagentWireGroup<T>>
} {
  const parentOf = new Map<string, string | undefined>()
  for (const message of messages) {
    const id = wireSubagentRunId(message)
    if (id !== undefined && !parentOf.has(id)) {
      parentOf.set(id, wireSubagentInfo(message)?.parentSubagentRunId)
    }
  }
  const rootOf = (id: string) => {
    let current = id
    for (let depth = 0; depth < 64; depth++) {
      const parent = parentOf.get(current)
      if (parent === undefined || !parentOf.has(parent)) return current
      current = parent
    }
    return current
  }

  const top: Array<T> = []
  const groups = new Map<string, SubagentWireGroup<T>>()
  for (const message of messages) {
    const id = wireSubagentRunId(message)
    if (id === undefined) {
      top.push(message)
      continue
    }
    const root = rootOf(id)
    let group = groups.get(root)
    if (!group) {
      group = {
        id: root,
        info: { name: 'subagent', status: 'finished' },
        messages: [],
        hostIndex: top.length - 1,
      }
      groups.set(root, group)
    }
    if (id !== root) {
      group.messages.push(message)
      continue
    }
    const info = wireSubagentInfo(message)
    if (info) group.info = info
    if (!info?.placeholder) group.messages.push(untag(message))
  }
  return { top, groups: [...groups.values()] }
}

/** Text a child wrote, for the parent model and for a later child. */
export function subagentWireText(messages: ReadonlyArray<unknown>): string {
  const blocks: Array<string> = []
  for (const message of messages) {
    if (!isRecord(message) || message.role !== 'assistant') continue
    if (wireSubagentRunId(message) !== undefined) continue
    const content = message.content
    if (typeof content === 'string' && content.trim() !== '') {
      blocks.push(content.trim())
    }
  }
  const nested = splitSubagentWire(messages).groups
  for (const group of nested) {
    const text = subagentWireText(group.messages)
    if (text !== '') blocks.push(`${group.info.name}:\n${text}`)
  }
  return blocks.join('\n\n')
}

/**
 * The id of the parent assistant message that hosts a routed turn's cards.
 * The persistence recorder writes that message, and a handoff run passes the
 * same id so the stored thread keeps one copy.
 */
export function subagentHostMessageId(runId: string) {
  return `assistant:${runId}`
}
