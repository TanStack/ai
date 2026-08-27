import type { ModelMessage } from '@tanstack/ai'

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
