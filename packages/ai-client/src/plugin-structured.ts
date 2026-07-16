import type { UIMessage } from './types.js'

/**
 * Computes the "active" structured-output `partial`/`final` values from a
 * `UIMessage` history — the framework-agnostic core of `useChat`'s
 * `partial`/`final` fields, shared by the plugin hooks.
 *
 * The "active" structured-output part is the one on the assistant message
 * that follows the latest user message. No such message exists between
 * `sendMessage()` and the first chunk, so `partial`/`final` naturally read
 * as cleared. Historical parts on earlier assistant messages remain
 * available via `messages` directly.
 *
 * When there is NO user message yet (e.g. `initialMessages` contains only a
 * stale assistant turn or a system prompt) this deliberately returns
 * `{ partial: {}, final: null }` rather than scanning historical
 * assistants — otherwise a `final` from a previous session would leak into
 * the hook value on first render.
 */
export function computeStructuredParts(messages: ReadonlyArray<UIMessage>): {
  partial: unknown
  final: unknown
} {
  let lastUserIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      lastUserIndex = i
      break
    }
  }
  if (lastUserIndex === -1) return { partial: {}, final: null }

  for (let i = messages.length - 1; i > lastUserIndex; i--) {
    const m = messages[i]
    if (m?.role !== 'assistant') continue
    const part = m.parts.find((p) => p.type === 'structured-output')
    if (part) {
      return {
        partial: part.partial ?? part.data ?? {},
        final: part.status === 'complete' ? part.data : null,
      }
    }
  }

  return { partial: {}, final: null }
}
