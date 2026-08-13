import type { ModelMessage } from '@tanstack/ai'

export interface BuiltPrompt {
  prompt: string
  /** Session id to resume, when the caller threaded one through. */
  resume?: string
}

function extractText(content: ModelMessage['content']): string {
  if (content === null) return ''
  if (typeof content === 'string') return content
  return content
    .map((part) =>
      part.type === 'text' && typeof part.content === 'string'
        ? part.content
        : '',
    )
    .join('')
}

/**
 * Convert TanStack chat history into the harness prompt + resume inputs.
 *
 * With a `sessionId`, the harness already holds the conversation context, so
 * only the trailing user message is sent and the session is resumed. Without
 * one, prior turns are flattened into a plain-text transcript preamble.
 */
export function buildPrompt(
  messages: Array<ModelMessage>,
  sessionId: string | undefined,
): BuiltPrompt {
  const lastMessage = messages.at(-1)
  const lastUserText =
    lastMessage?.role === 'user' ? extractText(lastMessage.content).trim() : ''

  if (!lastUserText) {
    throw new Error(
      'Grok Build adapter requires a trailing user message with text content.',
    )
  }

  if (sessionId !== undefined) {
    return { prompt: lastUserText, resume: sessionId }
  }

  const priorTurns = messages
    .slice(0, -1)
    .filter(
      (message) =>
        (message.role === 'user' || message.role === 'assistant') &&
        extractText(message.content).trim() !== '',
    )
    .map(
      (message) =>
        `${message.role === 'user' ? 'User' : 'Assistant'}: ${extractText(message.content).trim()}`,
    )

  if (priorTurns.length === 0) {
    return { prompt: lastUserText }
  }

  return {
    prompt: `Previous conversation:\n${priorTurns.join('\n')}\n\n${lastUserText}`,
  }
}
