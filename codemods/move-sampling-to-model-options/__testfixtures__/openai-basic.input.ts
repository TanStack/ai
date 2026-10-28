import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export function run(messages: Array<unknown>) {
  return chat({
    adapter: openaiText('gpt-4o'),
    messages,
    temperature: 0.3,
    maxTokens: 100,
  })
}
