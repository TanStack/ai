import type { ModelMessage } from '../../../types'

/**
 * Internal converter for `chat({ mcp: { prompts } })`.
 * Public API: `@tanstack/ai-mcp`'s `mcpPromptToMessages` — keep in sync.
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
        : JSON.stringify(m.content ?? null)
    return { role, content }
  })
}
