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
  let emittedLength = 0
  let lastMessageId = ''

  return {
    name: 'content-guard',

    onChunk(_ctx: ChatMiddlewareContext, chunk: StreamChunk) {
      // Flush buffer on stream end events
      if (chunk.type === 'TEXT_MESSAGE_END' || chunk.type === 'RUN_FINISHED') {
        if (rawAccumulated.length === 0) return // nothing buffered

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
          rawAccumulated = ''
          emittedLength = 0
          return // pass through end event, content was blocked
        }

        const remaining = filtered.slice(emittedLength)
        if (remaining.length > 0) {
          if (filtered !== rawAccumulated && onFiltered) {
            onFiltered({
              messageId: lastMessageId,
              original: rawAccumulated,
              filtered,
              strategy: 'buffered',
            })
          }

          const flushChunk: StreamChunk = {
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: lastMessageId,
            delta: remaining,
            content: filtered,
            timestamp: Date.now(),
          } as StreamChunk

          rawAccumulated = ''
          emittedLength = 0
          return [flushChunk, chunk]
        }

        rawAccumulated = ''
        emittedLength = 0
        return // pass through end event
      }

      if (chunk.type !== 'TEXT_MESSAGE_CONTENT') return // pass through

      rawAccumulated += chunk.delta
      lastMessageId = chunk.messageId

      // Compute the safe raw boundary
      const safeRawEnd = rawAccumulated.length - bufferSize
      if (safeRawEnd <= 0) return null // still buffering

      // Apply rules to the settled portion only
      const settledRaw = rawAccumulated.slice(0, safeRawEnd)
      const settledFiltered = applyRules(settledRaw, rules)

      if (blockOnMatch && settledFiltered !== settledRaw) {
        if (onFiltered) {
          onFiltered({
            messageId: chunk.messageId,
            original: settledRaw,
            filtered: settledFiltered,
            strategy: 'buffered',
          })
        }
        return null // drop — content was modified
      }

      if (settledFiltered.length <= emittedLength) return null // no new content

      const newDelta = settledFiltered.slice(emittedLength)
      emittedLength = settledFiltered.length

      if (settledFiltered !== settledRaw && onFiltered) {
        onFiltered({
          messageId: chunk.messageId,
          original: settledRaw,
          filtered: settledFiltered,
          strategy: 'buffered',
        })
      }

      return {
        ...chunk,
        delta: newDelta,
        content: settledFiltered,
      } as StreamChunk
    },
  }
}
