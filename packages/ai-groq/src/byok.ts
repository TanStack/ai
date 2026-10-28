import { defineByokProvider } from '@tanstack/ai/byok'

export const groqByok = defineByokProvider({
  id: 'groq',
  label: 'Groq',
  env: 'GROQ_API_KEY',
})
