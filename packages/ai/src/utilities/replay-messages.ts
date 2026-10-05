import { buildBlockOrder, orderedAssistantBlocks } from './block-order'
import { isProviderExecutedToolCall } from './provider-executed'
import { tanstackMetadata } from './merge-metadata'
import type { BlockOrderEntry, OrderedAssistantBlock } from './block-order'
import type { MessageSource, ModelMessage, ToolCall } from '../types'

export type ReplayToolIdRule = (
  id: string,
  context: {
    foreign: boolean
    source: MessageSource | undefined
    attempt: number
  },
) => string

export interface ReplayMessages {
  messages: Array<ModelMessage>
  /** Index of each original boundary in the request, including the end boundary. */
  boundaryMap: Array<number>
}

/** The pi shortHash algorithm, over UTF-16 code units. */
export function hashToolCallId(id: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let index = 0; index < id.length; index++) {
    const ch = id.charCodeAt(index)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36)
}

function isForeign(
  message: ModelMessage,
  target: MessageSource | undefined,
): boolean {
  const source = tanstackMetadata(message.metadata)?.source
  return (
    target !== undefined &&
    source !== undefined &&
    (source.provider !== target.provider ||
      source.api !== target.api ||
      source.model !== target.model)
  )
}

function isFailed(message: ModelMessage): boolean {
  const stop = tanstackMetadata(message.metadata)?.stopReason
  return (
    message.role === 'assistant' && (stop === 'error' || stop === 'aborted')
  )
}

/** Build a provider request without changing stored history. An absent target only cleans history. */
export function transformMessagesForReplay(
  original: ReadonlyArray<ModelMessage>,
  target?: MessageSource,
  toolIdRule?: ReplayToolIdRule,
): ReplayMessages {
  const usedIds = new Set<string>()
  for (const message of original) {
    if (!isForeign(message, target) && !isFailed(message)) {
      for (const call of message.toolCalls ?? []) usedIds.add(call.id)
    }
  }
  const idMap = new Map<string, string>()
  const failedCallBatch = new Map<string, boolean>()
  const messages: Array<ModelMessage> = []
  const boundaryMap: Array<number> = []
  let pending: Array<ToolCall> = []
  const answered = new Set<string>()
  const deferredBoundaries: Array<number> = []
  const closePending = () => {
    for (const call of pending) {
      if (!answered.has(call.id) && !isProviderExecutedToolCall(call)) {
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.function.name,
          content: 'No result provided',
          error: 'No result provided',
        })
      }
    }
    pending = []
    answered.clear()
    for (const index of deferredBoundaries) boundaryMap[index] = messages.length
    deferredBoundaries.length = 0
  }
  const mapCall = (
    call: ToolCall,
    foreign: boolean,
    source: MessageSource | undefined,
  ): ToolCall => {
    let id = call.id
    if (foreign && toolIdRule) {
      let attempt = 0
      do {
        if (attempt === 1000)
          throw new Error(
            `Tool ID rule could not allocate a unique ID for ${call.id}`,
          )
        id = toolIdRule(call.id, { foreign, source, attempt: attempt++ })
      } while (usedIds.has(id))
      usedIds.add(id)
    }
    idMap.set(call.id, id)
    if (!foreign && id === call.id) return call
    const metadata = call.metadata
    if (
      metadata !== null &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata)
    ) {
      const rest = Object.fromEntries(
        Object.entries(metadata).filter(([key]) => key !== 'thoughtSignature'),
      )
      return { ...call, id, metadata: rest }
    }
    return id === call.id ? call : { ...call, id }
  }
  for (const [index, message] of original.entries()) {
    if (message.role !== 'tool') closePending()
    boundaryMap[index] = messages.length
    if (message.role === 'assistant') {
      for (const call of message.toolCalls ?? [])
        failedCallBatch.set(call.id, isFailed(message))
    }
    if (isFailed(message)) continue
    if (message.role === 'tool') {
      if (
        message.toolCallId !== undefined &&
        failedCallBatch.get(message.toolCallId)
      )
        continue
      if (pending.length > 0) deferredBoundaries.push(index)
      const id =
        message.toolCallId !== undefined
          ? idMap.get(message.toolCallId)
          : undefined
      const mapped =
        id !== undefined && id !== message.toolCallId
          ? { ...message, toolCallId: id }
          : message
      if (mapped.toolCallId !== undefined) answered.add(mapped.toolCallId)
      messages.push(mapped)
      continue
    }
    if (message.role !== 'assistant') {
      messages.push(message)
      continue
    }
    const foreign = isForeign(message, target)
    let mapped = message
    if (foreign) {
      const defaultBlocks: Array<OrderedAssistantBlock> = [
        ...(message.thinking ?? []).map((thinking) => ({
          type: 'thinking' as const,
          thinking,
        })),
        ...(typeof message.content === 'string'
          ? [{ type: 'text' as const, text: message.content }]
          : []),
        ...(message.toolCalls ?? []).map((toolCall) => ({
          type: 'tool-call' as const,
          toolCall,
        })),
      ]
      const blocks = orderedAssistantBlocks(message) ?? defaultBlocks
      const entries: Array<BlockOrderEntry> = []
      const calls: Array<ToolCall> = []
      let content = ''
      for (const block of blocks) {
        if (block.type === 'tool-call') {
          const call = mapCall(
            block.toolCall,
            true,
            tanstackMetadata(message.metadata)?.source,
          )
          calls.push(call)
          entries.push({ type: 'tool-call', id: call.id })
        } else {
          const text =
            block.type === 'text'
              ? block.text
              : block.thinking.redacted
                ? ''
                : block.thinking.content.trim() === ''
                  ? ''
                  : block.thinking.content
          if (text) {
            content += text
            entries.push({ type: 'text', text })
          }
        }
      }
      const { thinking: _thinking, blockOrder: _order, ...rest } = message
      mapped = {
        ...rest,
        content:
          typeof message.content === 'string' || message.content === null
            ? content || null
            : content
              ? [{ type: 'text', content }, ...message.content]
              : message.content,
        ...(message.toolCalls ? { toolCalls: calls } : {}),
        ...(buildBlockOrder(entries)
          ? { blockOrder: buildBlockOrder(entries) }
          : {}),
      }
    } else {
      for (const call of message.toolCalls ?? []) idMap.set(call.id, call.id)
    }
    pending = mapped.toolCalls ?? []
    messages.push(mapped)
  }
  closePending()
  boundaryMap[original.length] = messages.length
  return { messages, boundaryMap }
}
