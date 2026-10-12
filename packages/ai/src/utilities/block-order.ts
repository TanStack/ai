import type { ModelMessage, ModelMessageBlock, ToolCall } from '../types'

/** One block of an assistant answer, in the order the model produced it. */
export type BlockOrderEntry =
  | { type: 'thinking' }
  | { type: 'text'; text: string }
  | { type: 'tool-call'; id: string }

/**
 * The order map for these entries in produced order, or undefined when they
 * are in the default order (all thinking, then text, then tool calls).
 * Adjacent text entries merge into one, and empty text is left out. The n-th
 * thinking entry gets index n.
 */
export function buildBlockOrder(
  entries: ReadonlyArray<BlockOrderEntry>,
): Array<ModelMessageBlock> | undefined {
  const blocks: Array<ModelMessageBlock> = []
  let thinking = 0
  let isDefault = true
  for (const entry of entries) {
    const last = blocks.at(-1)
    if (entry.type === 'thinking') {
      if (last !== undefined && last.type !== 'thinking') isDefault = false
      blocks.push({ type: 'thinking', index: thinking++ })
    } else if (entry.type === 'text') {
      if (entry.text === '') continue
      if (last?.type === 'text') {
        last.length += entry.text.length
        continue
      }
      if (last?.type === 'tool-call') isDefault = false
      blocks.push({ type: 'text', length: entry.text.length })
    } else {
      blocks.push({ type: 'tool-call', id: entry.id })
    }
  }
  return isDefault ? undefined : blocks
}

/** A block of an assistant message, resolved from its order map. */
export type OrderedAssistantBlock =
  | {
      type: 'thinking'
      thinking: NonNullable<ModelMessage['thinking']>[number]
    }
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCall: ToolCall }

/**
 * The blocks of an assistant message in map order, or undefined when the
 * message has no map or the map does not match the message. A map matches
 * when it uses each `thinking` entry and each `toolCalls` entry exactly once,
 * and its text lengths add up to the length of the text content (`null`
 * content counts as no text). Readers use the default order when this
 * returns undefined.
 */
export function orderedAssistantBlocks(
  message: ModelMessage,
): Array<OrderedAssistantBlock> | undefined {
  const order = message.blockOrder
  if (!Array.isArray(order) || order.length === 0) return undefined
  const content = message.content ?? ''
  if (typeof content !== 'string') return undefined
  const thinking = message.thinking ?? []
  const toolCalls = message.toolCalls ?? []
  const usedThinking = new Set<number>()
  const usedCalls = new Set<string>()
  const blocks: Array<OrderedAssistantBlock> = []
  let offset = 0
  for (const block of order) {
    // Stored data can hold anything, so check each entry.
    if (typeof block !== 'object' || block === null) return undefined
    if (block.type === 'thinking') {
      const entry = Number.isInteger(block.index)
        ? thinking[block.index]
        : undefined
      if (entry === undefined || usedThinking.has(block.index)) {
        return undefined
      }
      usedThinking.add(block.index)
      blocks.push({ type: 'thinking', thinking: entry })
    } else if (block.type === 'text') {
      const end = offset + block.length
      if (
        !Number.isInteger(block.length) ||
        block.length <= 0 ||
        end > content.length
      ) {
        return undefined
      }
      blocks.push({ type: 'text', text: content.slice(offset, end) })
      offset = end
    } else if (block.type === 'tool-call') {
      const toolCall = toolCalls.find((candidate) => candidate.id === block.id)
      if (toolCall === undefined || usedCalls.has(block.id)) return undefined
      usedCalls.add(block.id)
      blocks.push({ type: 'tool-call', toolCall })
    } else {
      return undefined
    }
  }
  if (
    offset !== content.length ||
    usedThinking.size !== thinking.length ||
    usedCalls.size !== toolCalls.length
  ) {
    return undefined
  }
  return blocks
}
