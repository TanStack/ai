import type { AcpSessionUpdate } from '@tanstack/ai-acp'

const GROK_SESSION_NOTIFICATION = '_x.ai/session_notification'

interface ToolAccumulator {
  toolCallId: string
  name?: string
  args: string
  opened: boolean
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}

function toolCallId(update: Record<string, unknown>): string | undefined {
  const id = update.tool_call_id
  if (typeof id === 'string' && id !== '') return id
  const index = update.tool_index
  if (typeof index === 'number') return `tool-${index}`
  return undefined
}

function parseToolInput(args: string): unknown {
  if (args.trim() === '') return {}
  try {
    return JSON.parse(args) as unknown
  } catch {
    return { raw: args }
  }
}

/**
 * Bridge Grok Build's proprietary `_x.ai/session_notification` updates into the
 * shared ACP {@link AcpSessionUpdate} shape consumed by {@link translateAcpStream}.
 */
export function createGrokAcpNotificationHandler(
  onUpdate: (update: AcpSessionUpdate) => void,
): (method: string, params: Record<string, unknown>) => void {
  const tools = new Map<string, ToolAccumulator>()

  return (method, params) => {
    if (method !== GROK_SESSION_NOTIFICATION) return

    const update = asRecord(params.update)
    if (update === undefined) return

    const kind = update.sessionUpdate
    if (kind === 'tool_call_delta_chunk') {
      const id = toolCallId(update)
      if (id === undefined) return

      let state = tools.get(id)
      if (state === undefined) {
        state = { toolCallId: id, args: '', opened: false }
        tools.set(id, state)
      }

      if (typeof update.name === 'string' && update.name !== '') {
        state.name = update.name
        if (!state.opened) {
          state.opened = true
          onUpdate({
            sessionUpdate: 'tool_call',
            toolCallId: id,
            title: update.name,
            kind: update.name,
            status: 'in_progress',
          })
        }
      }

      if (typeof update.arguments_delta === 'string') {
        state.args += update.arguments_delta
        if (state.opened && state.name !== undefined) {
          onUpdate({
            sessionUpdate: 'tool_call_update',
            toolCallId: id,
            title: state.name,
            kind: state.name,
            status: 'in_progress',
            rawInput: parseToolInput(state.args),
          })
        }
      }
      return
    }

    if (kind === 'interaction_resolved') {
      const id =
        typeof update.tool_call_id === 'string'
          ? update.tool_call_id
          : undefined
      if (id === undefined) return
      const state = tools.get(id)
      if (state === undefined) return
      onUpdate({
        sessionUpdate: 'tool_call_update',
        toolCallId: id,
        title: state.name ?? null,
        kind: state.name ?? null,
        status: 'completed',
        rawInput: parseToolInput(state.args),
      })
      tools.delete(id)
      return
    }

    if (kind === 'agent_message_chunk' || kind === 'agent_thought_chunk') {
      const content = asRecord(update.content)
      const text = typeof content?.text === 'string' ? content.text : ''
      if (text === '') return
      onUpdate({
        sessionUpdate: kind,
        content: { type: 'text', text },
      })
    }
  }
}
