import type {
  ChatMiddleware,
  ChatMiddlewareContext,
} from '../activities/chat/middleware/types'
import type { StreamChunk } from '../types'

export type ContentGuardRule =
  | { pattern: RegExp; replacement: string }
  | { fn: (text: string) => string }

export interface ContentFilteredInfo {
  /** The message ID being filtered */
  messageId: string
  /** The original text before filtering */
  original: string
  /** The filtered text after rules applied */
  filtered: string
  /** Which strategy was used */
  strategy: 'delta' | 'buffered'
}

export interface ContentGuardMiddlewareOptions {
  rules: Array<ContentGuardRule>

  strategy?: 'delta' | 'buffered'

  bufferSize?: number

  blockOnMatch?: boolean

  onFiltered?: (info: ContentFilteredInfo) => void
}

function applyRules(text: string, rules: Array<ContentGuardRule>): string {
  let result = text
  for (const rule of rules) {
    if ('pattern' in rule) {
      result = result.replace(rule.pattern, rule.replacement)
    } else {
      result = rule.fn(result)
    }
  }
  return result
}

export function contentGuardMiddleware(
  options: ContentGuardMiddlewareOptions,
): ChatMiddleware {
  const {
    rules,
    strategy = 'buffered',
    bufferSize = 50,
    blockOnMatch = false,
    onFiltered,
  } = options

  if (strategy === 'delta') {
    return createDeltaStrategy(rules, blockOnMatch, onFiltered)
  }
  return createBufferedStrategy(rules, bufferSize, blockOnMatch, onFiltered)
}

function createDeltaStrategy(
  rules: Array<ContentGuardRule>,
  blockOnMatch: boolean,
  onFiltered?: (info: ContentFilteredInfo) => void,
): ChatMiddleware {
  return {
    name: 'content-guard',

    onChunk(_ctx: ChatMiddlewareContext, chunk: StreamChunk) {
      if (chunk.type !== 'TEXT_MESSAGE_CONTENT') return

      const original = chunk.delta
      const filtered = applyRules(original, rules)

      if (filtered === original) return // unchanged, pass through

      if (onFiltered) {
        onFiltered({
          messageId: chunk.messageId,
          original,
          filtered,
          strategy: 'delta',
        })
      }

      if (blockOnMatch) return null // drop chunk

      const { content: _strippedContent, ...rest } = chunk
      void _strippedContent
      return {
        ...rest,
        delta: filtered,
      }
    },
  }
}

function createBufferedStrategy(
  rules: Array<ContentGuardRule>,
  bufferSize: number,
  blockOnMatch: boolean,
  onFiltered?: (info: ContentFilteredInfo) => void,
): ChatMiddleware {
  let rawAccumulated = ''
  let emittedFilteredLength = 0
  let lastMessageId = ''

  function resetState() {
    rawAccumulated = ''
    emittedFilteredLength = 0
    lastMessageId = ''
  }

  function flushBuffer(): StreamChunk | null {
    if (rawAccumulated.length === 0) return null

    const filtered = applyRules(rawAccumulated, rules)

    const hasBlockOnMatch = blockOnMatch && filtered !== rawAccumulated
    if (hasBlockOnMatch) {
      if (onFiltered) {
        onFiltered({
          messageId: lastMessageId,
          original: rawAccumulated,
          filtered,
          strategy: 'buffered',
        })
      }
      resetState()
      return null
    }

    const remaining = filtered.slice(emittedFilteredLength)
    if (remaining.length > 0) {
      const hasFiltered = filtered !== rawAccumulated && onFiltered
      if (hasFiltered) {
        onFiltered({
          messageId: lastMessageId,
          original: rawAccumulated,
          filtered,
          strategy: 'buffered',
        })
      }

      const flushed = {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: lastMessageId,
        delta: remaining,
        content: filtered,
        timestamp: Date.now(),
      } as StreamChunk

      resetState()
      return flushed
    }

    resetState()
    return null
  }

  return {
    name: 'content-guard',

    onStart() {
      resetState()
    },

    onChunk(_ctx: ChatMiddlewareContext, chunk: StreamChunk) {
      // Flush buffer on stream end events
      const isTEXTMESSAGEEND =
        chunk.type === 'TEXT_MESSAGE_END' || chunk.type === 'RUN_FINISHED'
      if (isTEXTMESSAGEEND) {
        const flushed = flushBuffer()
        if (flushed) return [flushed, chunk]
        return // pass through end event
      }

      if (chunk.type !== 'TEXT_MESSAGE_CONTENT') return // pass through

      // Flush buffer on message boundary change
      const pending: Array<StreamChunk> = []
      const hasLastMessageId =
        lastMessageId && chunk.messageId !== lastMessageId
      if (hasLastMessageId) {
        const flushed = flushBuffer()
        if (flushed) pending.push(flushed)
      }

      rawAccumulated += chunk.delta
      lastMessageId = chunk.messageId

      // Apply rules to full accumulated text, buffer in filtered space
      const filtered = applyRules(rawAccumulated, rules)
      const safeFilteredEnd = Math.max(0, filtered.length - bufferSize)

      if (safeFilteredEnd <= emittedFilteredLength) {
        return pending.length > 0 ? pending : null
      }

      const hasBlockOnMatch = blockOnMatch && filtered !== rawAccumulated
      if (hasBlockOnMatch) {
        if (onFiltered) {
          onFiltered({
            messageId: chunk.messageId,
            original: rawAccumulated,
            filtered,
            strategy: 'buffered',
          })
        }
        return pending.length > 0 ? pending : null
      }

      const newDelta = filtered.slice(emittedFilteredLength, safeFilteredEnd)

      const hasFiltered = filtered !== rawAccumulated && onFiltered
      if (hasFiltered) {
        onFiltered({
          messageId: chunk.messageId,
          original: rawAccumulated,
          filtered,
          strategy: 'buffered',
        })
      }

      emittedFilteredLength = safeFilteredEnd

      const emitChunk = {
        ...chunk,
        delta: newDelta,
        content: filtered.slice(0, safeFilteredEnd),
      } as StreamChunk

      // `pending` was empty before this push iff `emitChunk` is now the only
      // entry — return it directly without re-indexing through `pending[0]`.
      const wasEmpty = pending.length === 0
      pending.push(emitChunk)
      return wasEmpty ? emitChunk : pending
    },
  }
}
