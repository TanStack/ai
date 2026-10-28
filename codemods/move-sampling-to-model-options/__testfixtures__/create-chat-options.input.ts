import { createChatOptions } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export const options = createChatOptions({
  adapter: openaiText('gpt-4o'),
  temperature: 0.2,
  topP: 0.8,
})
