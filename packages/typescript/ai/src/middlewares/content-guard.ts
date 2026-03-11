import type {
  ChatMiddleware,
  ChatMiddlewareContext,
} from '../activities/chat/middleware/types'
import type { StreamChunk } from '../types'

/**
 * A content guard rule — either a regex pattern with replacement, or a transform function.
 */
export type ContentGuardRule =
  | { pattern: RegExp; replacement: string }
  | { fn: (text: string) => string }

/**
 * Information passed to the onFiltered callback.
 */
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

/**
 * Options for the content guard middleware.
 */
export interface ContentGuardMiddlewareOptions {
  /**
   * Rules to apply to text content. Each rule is either a regex pattern
   * with a replacement string, or a custom transform function.
   * Rules are applied in order. Each rule receives the output of the previous.
   */
  rules: Array<ContentGuardRule>

  /**
   * Matching strategy:
   * - 'delta': Apply rules to each delta as it arrives. Fast, real-time,
   *   but patterns spanning chunk boundaries may be missed.
   * - 'buffered': Accumulate content and apply rules to settled portions,
   *   holding back a look-behind buffer to catch cross-boundary patterns.
   *
   * @default 'buffered'
   */
  strategy?: 'delta' | 'buffered'

  /**
   * Number of characters to hold back before emitting (buffered strategy only).
   * Should be at least as long as the longest pattern you expect to match.
   * Buffer is flushed when the stream ends.
   *
   * @default 50
   */
  bufferSize?: number

  /**
   * If true, drop the entire chunk when any rule changes the content.
   * @default false
   */
  blockOnMatch?: boolean

  /**
   * Callback when content is filtered by any rule.
   */
  onFiltered?: (info: ContentFilteredInfo) => void
}

/**
 * Apply all rules to a string, returning the transformed result.
 */
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

/**
 * Creates a middleware that filters or transforms streamed text content.
 *
 * @example
 * ```ts
 * import { contentGuardMiddleware } from '@tanstack/ai/middlewares'
 *
 * const guard = contentGuardMiddleware({
 *   rules: [
 *     { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN REDACTED]' },
 *   ],
 *   strategy: 'buffered',
 * })
 * ```
 */
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

      return {
        ...chunk,
        delta: filtered,
        content: undefined,
      } as StreamChunk
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

    if (blockOnMatch && filtered !== rawAccumulated) {
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
      if (filtered !== rawAccumulated && onFiltered) {
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
      if (chunk.type === 'TEXT_MESSAGE_END' || chunk.type === 'RUN_FINISHED') {
        const flushed = flushBuffer()
        if (flushed) return [flushed, chunk]
        return // pass through end event
      }

      if (chunk.type !== 'TEXT_MESSAGE_CONTENT') return // pass through

      // Flush buffer on message boundary change
      const pending: Array<StreamChunk> = []
      if (lastMessageId && chunk.messageId !== lastMessageId) {
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

      if (blockOnMatch && filtered !== rawAccumulated) {
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

      if (filtered !== rawAccumulated && onFiltered) {
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

      pending.push(emitChunk)
      return pending.length === 1 ? pending[0]! : pending
    },
  }
}
