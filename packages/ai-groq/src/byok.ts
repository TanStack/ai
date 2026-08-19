import { defineByokProvider } from '@tanstack/ai/byok'

export const groqByok = defineByokProvider({
  id: 'groq',
  label: 'Groq',
  validate: {
    url: 'https://api.groq.com/openai/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
})
