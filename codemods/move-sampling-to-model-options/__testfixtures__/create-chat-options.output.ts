import { createChatOptions } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export const options = createChatOptions({
  adapter: openaiText('gpt-4o'),

  modelOptions: {
    temperature: 0.2,
    top_p: 0.8
  }
})
