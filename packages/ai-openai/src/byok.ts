import { defineByokProvider } from '@tanstack/ai/byok'

export const openaiByok = defineByokProvider({
  id: 'openai',
  label: 'OpenAI',
  env: 'OPENAI_API_KEY',
})
