import { defineByokProvider } from '@tanstack/ai/byok'

export const openaiByok = defineByokProvider({
  id: 'openai',
  label: 'OpenAI',
  env: 'OPENAI_API_KEY',
  validate: {
    url: 'https://api.openai.com/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
})
