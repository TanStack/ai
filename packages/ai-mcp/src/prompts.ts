import type { ModelMessage } from '@tanstack/ai'

/**
 * Convert an MCP GetPromptResult into an array of ModelMessages suitable for
 * passing to `chat()` or any TanStack AI adapter.
 *
 * @param prompt - An object with a `messages` array as returned by the MCP
 *   `prompts/get` endpoint.
 * @returns An array of {@link ModelMessage} values.
 */
export function mcpPromptToMessages(prompt: {
  messages: Array<{
    role: string
    content?: { type: string; text?: string } | null
  }>
}): Array<ModelMessage> {
  return prompt.messages.map((m) => {
    const role: 'user' | 'assistant' =
      m.role === 'assistant' ? 'assistant' : 'user'
    const content =
      m.content?.type === 'text' && m.content.text !== undefined
        ? m.content.text
        : // `?? null` so absent content stringifies to 'null' rather than
          // producing `undefined` (invalid for ModelMessage['content']).
          JSON.stringify(m.content ?? null)
    return { role, content }
  })
}
