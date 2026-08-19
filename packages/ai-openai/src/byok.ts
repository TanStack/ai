import { defineByokProvider } from '@tanstack/ai/byok'

export const openaiByok = defineByokProvider({
  id: 'openai',
  label: 'OpenAI',
  validate: {
    url: 'https://api.openai.com/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
})
